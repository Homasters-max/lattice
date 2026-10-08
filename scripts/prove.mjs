#!/usr/bin/env node
// prove: the proof of what a change touches (S0-42) — every test set of fitness (ST-12) and the test sets whose input
// differs from the base, with the steps of verify but its tests, in parallel (scripts/verify.mjs).
// The input of a test set is what its hash covers: the files it owns (scripts/paths.mjs; ST-18), every file they
// import, transitively, the programs they start through program("<entry>") and what those import, knowledge —
// docs/design — when a file of it imports `knowledge`, and the config of a run: package.json, the lockfile,
// tsconfig.json, vitest.config.ts and the setup of test/support/. A file counts by its git blob, text with LF.
// A test set runs when its hash over the working tree differs from its hash at the base, with LATTICE_SEED taken from
// the hash (S0-41): the same input draws the same cases; test sets of one hash share a run. The base is the merge
// base of `--base` (origin/main by default) and HEAD; what is not committed counts as changed.
// The full output goes to .lattice/prove.log; the last line of stdout is the outcome as JSON:
//   {"outcome": "passed" | "failed", "base": "<commit>",
//    "sets": [{"set": "kernel", "reasons": ["import: src/kernel/canon.ts"], "hash": "sha256:…", "seed": 123, "exit": 0, "ms": 900}, …],
//    "skipped": ["ledger", …], "steps": [{"step": "lint:ids", "ms": 640, "exit": 0}, …], "log": "<path of the log>"}
// The exit code is 1 when a test set or a step fails.
// --ready (S0-44) adds the mutants of the changed hunks of src/ (scripts/mutate.mjs): the line gets
//   "mutants": {"report": "<path>", "total", "killed", "survived", "budget-exceeded", "ran", "survivors": […]};
//   a survivor does not fail the outcome — the executor or the fixer decides it (plan/dev-loop.md).
// Every run writes a record of each test set it ran (scripts/runs.mjs, S0-43) under the key of its inputs: the hashes of
// its code, of its knowledge and of the config of a run, split from its input, and the environment. A set of the line
// names its key, its outcome — ok, failed or budget-exceeded, when every failure is the safeguard of time (S0-41) — and
// what failed: its tests by the JSON report of vitest, and for a fitness set the failed steps too — the type check and the
// quality profile are fitness tests (ST-12), and a fitness set owns their input, the whole repository.
// --gate (dl gate, S0-43) proves the head by the records of its keys: every test set whose key has no record ok runs, the
// steps with a fitness set alone; --shadow runs every set and compares each outcome with the record of its key. The line
// gets "gate": {"shadow", "recorded": [set with a record ok], "taken": [set taken from its record], "ran": [set],
//   "mismatches": [{"set", "key", "recorded", "outcome"}]}.
//   npm run prove [--ready] [-- --base <ref>] [-- --gate [--shadow]]
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import ts from "typescript";
import { filtersOf, FITNESS, owns, seedOf, testSetOf } from "./paths.mjs";
import { environment as environmentOfRun, keyOf, readRun, runsDir, writeRun } from "./runs.mjs";
import { finish, flagOf, isMain, runSteps, STEPS } from "./verify.mjs";

export { seedOf };

/** The config of every run of the tests: an input of every test set. */
const CONFIG = ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "test/support/setup.ts", "test/support/global-setup.ts"];
const CODE = /\.(ts|mts|js|mjs)$/;
const PROGRAM = /\bprogram\(\s*["']([^"']+)["']/g;
const KNOWLEDGE = /import\s*\{[^}]*\bknowledge\b[^}]*\}\s*from\s*["'][^"']*files\.js["']/;
const REASONS_LISTED = 5;
const FITNESS_REASON = "fitness: runs on every change request (ST-12)";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

/** The blob git stores for the bytes of a file: a text file with CRLF is stored with LF (.gitattributes). */
function blobOf(bytes) {
  const data = bytes.includes(0) ? bytes : Buffer.from(bytes.toString("latin1").replaceAll("\r\n", "\n"), "latin1");
  return createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
}

/** path → blob in the tree of the commit `ref`. */
function blobsAt(dir, ref) {
  const out = new Map();
  for (const row of git(dir, "ls-tree", "-r", "-z", ref).split("\0")) {
    const tab = row.indexOf("\t");
    const [, type, blob] = row.slice(0, tab).split(" ");
    if (type === "blob") out.set(row.slice(tab + 1), blob);
  }
  return out;
}

/** The working tree of `dir` against the commit `base`: its files, tracked or not ignored, their text and blobs. */
function treeOf(dir, base) {
  const files = [...new Set(git(dir, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0"))].filter((p) => p && existsSync(join(dir, p))).sort();
  const present = new Set(files);
  const texts = new Map();
  const blobs = new Map();
  const bytes = (p) => readFileSync(join(dir, p));
  return {
    files,
    base: blobsAt(dir, base),
    has: (p) => present.has(p),
    text: (p) => texts.get(p) ?? texts.set(p, bytes(p).toString("utf8")).get(p),
    blob: (p) => (present.has(p) ? (blobs.get(p) ?? blobs.set(p, blobOf(bytes(p))).get(p)) : "-"),
  };
}

/** A relative import of `from` as a file of the tree: `.js` names the `.ts` source when there is one. */
function resolveImport(tree, from, specifier) {
  const target = posix.normalize(posix.join(posix.dirname(from), specifier));
  return [target, target.replace(/\.js$/, ".ts"), target.replace(/\.mjs$/, ".mts")].find((p) => tree.has(p)) ?? target;
}

/** What a code file of the tree brings into the input: `[path, kind]` of its relative imports and of its programs. */
function linksOf(tree, path) {
  if (!CODE.test(path) || !tree.has(path)) return [];
  const text = tree.text(path);
  const imports = ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName).filter((s) => s.startsWith("."));
  const programs = [...text.matchAll(PROGRAM)].map((m) => m[1]).filter((entry) => entry.includes("/") && !posix.isAbsolute(entry));
  return [...imports.map((s) => [resolveImport(tree, path, s), "import"]), ...programs.map((p) => [posix.normalize(p), "program"])];
}

/**
 * The input of test set `set`: path → how it came in (owned, import, program, knowledge, config). What the files of
 * the set and the config import and start counts; a file it owns only as data counts by itself.
 */
function inputOf(tree, set) {
  // What the set owns is the classifier's (ST-18): the same decision test/support/files.ts refuses a read by.
  const input = new Map([...new Set([...tree.files, ...tree.base.keys()])].filter((p) => owns(set, p)).map((p) => [p, "owned"]));
  for (const p of CONFIG) if (!input.has(p)) input.set(p, "config");
  const fitness = FITNESS.includes(set);
  const queue = [...input.keys()].filter((p) => fitness || CONFIG.includes(p) || testSetOf(p) === set);
  let knowledge = false;
  while (queue.length > 0) {
    const path = queue.pop();
    if (CODE.test(path) && tree.has(path) && KNOWLEDGE.test(tree.text(path))) knowledge = true;
    for (const [link, kind] of linksOf(tree, path)) {
      if (input.has(link)) continue;
      input.set(link, kind);
      queue.push(link);
    }
  }
  if (knowledge) for (const p of new Set([...tree.files, ...tree.base.keys()])) if (p.startsWith("docs/design/") && !input.has(p)) input.set(p, "knowledge");
  return input;
}

/**
 * What the tests of `set` run as code (S0-44): the files their test files and the config import and start, transitively —
 * the files a mutant of which these tests can see. Unlike the input, a fitness set reaches only what its own tests import.
 */
function reachOf(tree, set) {
  const reach = new Set([...tree.files.filter((p) => testSetOf(p) === set), ...CONFIG]);
  const queue = [...reach];
  while (queue.length > 0)
    for (const [link] of linksOf(tree, queue.pop())) {
      if (reach.has(link)) continue;
      reach.add(link);
      queue.push(link);
    }
  return [...reach].sort();
}

/** The hash of an input over `blob` of each path: `-` for a path that is not there. */
const hashOf = (paths, blob) => sha256(paths.map((p) => `${p}\0${blob(p)}\n`).join(""));

/** The test sets of the tree: those that hold a test file vitest runs (test/**\/*.test.ts). */
const setsOf = (tree) => [...new Set(tree.files.filter((p) => p.endsWith(".test.ts")).map(testSetOf).filter(Boolean))].sort();

/** Why a set runs: the paths of its input that differ from the base, by how they came in. */
function reasonsOf(input, changed) {
  const listed = changed.slice(0, REASONS_LISTED).map((p) => `${input.get(p)}: ${p}`);
  return changed.length > REASONS_LISTED ? [...listed, `and ${changed.length - REASONS_LISTED} more`] : listed;
}

/**
 * The parts of the key of a record (S0-43): the hashes of the code, of the knowledge and of the config of a run in the
 * input `paths` — the paths there are in the tree, so that the key is of the tree and not of the base.
 */
function partsOf(paths, tree) {
  const present = paths.filter((p) => tree.has(p));
  const part = (keep) => hashOf(present.filter(keep), tree.blob);
  const knowledge = (p) => p.startsWith("docs/design/");
  return { code: part((p) => !knowledge(p) && !CONFIG.includes(p)), knowledge: part(knowledge), tools: part((p) => CONFIG.includes(p)) };
}

/**
 * Each test set of the repository at `dir` against the merge base of `base` and HEAD: `{set, run, reasons, hash, seed,
 * reach, code, knowledge, tools, key}`; `run` — fitness, or the hash of its input differs from the base; `reach` — what
 * its tests run as code; `key` — the key of its record on `environment` (scripts/runs.mjs).
 */
export function select({ dir = process.cwd(), base = "origin/main", environment = environmentOfRun() } = {}) {
  const from = git(dir, "merge-base", base, "HEAD").trim();
  const tree = treeOf(dir, from);
  const sets = setsOf(tree).map((set) => {
    const input = inputOf(tree, set);
    const paths = [...input.keys()].sort();
    const hash = hashOf(paths, tree.blob);
    const changed = hash === hashOf(paths, (p) => tree.base.get(p) ?? "-") ? [] : paths.filter((p) => tree.blob(p) !== (tree.base.get(p) ?? "-"));
    const fitness = FITNESS.includes(set);
    const parts = partsOf(paths, tree);
    const key = keyOf({ test_set: set, ...parts, environment });
    return { set, run: fitness || changed.length > 0, reasons: fitness ? [FITNESS_REASON] : reasonsOf(input, changed), hash, seed: seedOf(hash), reach: reachOf(tree, set), ...parts, key };
  });
  return { base: from, sets, files: tree.files, environment };
}

const TIMEOUT = /\b(Test|Hook) timed out in \d+ms/;
const firstLine = (text) => String(text ?? "").split("\n")[0];

/** The JSON report of vitest at `path`, or null. */
function reportAt(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The failures of test set `set` in the JSON report of vitest: `{test, timeout}` — `<file> > <name>`, or the file that failed to run. */
function failuresOf(report, set) {
  const out = [];
  for (const file of report?.testResults ?? []) {
    const at = relative(process.cwd(), file.name ?? "").replaceAll("\\", "/");
    if (testSetOf(at) !== set) continue;
    const failed = (file.assertionResults ?? []).filter((a) => a.status === "failed");
    for (const a of failed) out.push({ test: `${at} > ${a.fullName}`, timeout: TIMEOUT.test((a.failureMessages ?? []).join("\n")) });
    if (failed.length === 0 && file.status === "failed") out.push({ test: `${at}: ${firstLine(file.message)}`, timeout: TIMEOUT.test(file.message ?? "") });
  }
  return out;
}

/**
 * The outcome of a test set by the exit of its run and its failures: ok, budget-exceeded when every failure is the
 * safeguard of time, failed otherwise — a run that failed without a failure of the set fails it too: what failed the run
 * is not known to be another set's.
 */
function outcomeOf(exit, failures) {
  if (exit === 0 && failures.length === 0) return "ok";
  return failures.length > 0 && failures.every((f) => f.timeout) ? "budget-exceeded" : "failed";
}

// `npm run prove --ready` gives npm the flag, and npm gives it to the script as npm_config_ready; `-- --ready` gives it as is.
const readyOf = (args) => args.includes("--ready") || process.env.npm_config_ready === "true";

/**
 * What --gate runs (S0-43): every test set whose key has no record ok in `runs`, or every one with `shadow`; each with
 * its reason and the record of its key → `{running, recorded, gate}`.
 */
function gateOf(sets, runs, shadow) {
  const recorded = new Map(sets.map((s) => [s.set, readRun(runs, s.key)]));
  const proven = sets.filter((s) => recorded.get(s.set)?.outcome === "ok").map((s) => s.set);
  const reasonOf = (s) => `gate: ${recorded.get(s.set) ? `the record of its key is ${recorded.get(s.set).outcome}` : "no record of its key"}${shadow ? "; shadow runs every set" : ""}`;
  const running = sets.filter((s) => shadow || !proven.includes(s.set)).map((s) => ({ ...s, reasons: [reasonOf(s)] }));
  return { running, recorded, gate: { shadow, recorded: proven, taken: shadow ? [] : proven, ran: running.map((s) => s.set), mismatches: [] } };
}

if (isMain(import.meta.url)) {
  const log = resolve(".lattice", "prove.log");
  const args = process.argv.slice(2);
  let chosen;
  let runs;
  try {
    chosen = select({ base: flagOf(args, "base", "origin/main") });
    runs = runsDir(process.cwd());
  } catch (error) {
    finish(log, "", { outcome: "failed", error: String(error instanceof Error ? error.message : error).trim(), log }, false);
    process.exit();
  }
  const gating = args.includes("--gate") ? gateOf(chosen.sets, runs, args.includes("--shadow")) : null;
  const running = gating ? gating.running : chosen.sets.filter((s) => s.run);
  // Test sets of one hash — the fitness sets own the whole repository — share a seed and one run of vitest. The runs
  // go one after another, beside the other steps: vitest runs the files of a run in parallel itself; each writes the
  // JSON report its records read.
  const groups = Map.groupBy(running, (s) => s.hash);
  const stepOf = (hash) => `test ${groups.get(hash).map((s) => s.set).join(" ")}`;
  const reports = resolve(".lattice", "prove");
  mkdirSync(reports, { recursive: true });
  const reportOf = (hash) => join(reports, `${hash.slice("sha256:".length, "sha256:".length + 16)}.json`);
  const tests = [...groups].map(([hash, group]) => {
    rmSync(reportOf(hash), { force: true });
    return {
      step: stepOf(hash),
      command: `npm run --silent test -- --reporter=default --reporter=json "--outputFile.json=${reportOf(hash)}" ${group.flatMap((s) => filtersOf(s.set, chosen.files)).join(" ")}`,
      env: { LATTICE_SEED: String(group[0].seed) },
      queue: "test",
    };
  });
  // The steps go with a fitness set; --gate leaves them out when no fitness set runs: the record of each proves them.
  const withSteps = !gating || running.some((s) => FITNESS.includes(s.set));
  const steps = withSteps ? STEPS.filter((step) => step !== "test").map((step) => ({ step, command: `npm run --silent ${step}` })) : [];
  const { results, text } = await runSteps([...steps, ...tests]);
  const resultOf = new Map(results.map((r) => [r.step, r]));
  const stepFailures = results.slice(0, steps.length).filter((r) => r.exit !== 0).map((r) => ({ test: `step: ${r.step}`, timeout: false }));
  const head = git(process.cwd(), "rev-parse", "HEAD").trim();
  const at = new Date().toISOString();
  const sets = running.map((s) => {
    const { exit, ms } = resultOf.get(stepOf(s.hash));
    const failures = [...failuresOf(reportAt(reportOf(s.hash)), s.set), ...(FITNESS.includes(s.set) ? stepFailures : [])];
    const outcome = outcomeOf(exit, failures);
    const failed = outcome !== "ok" && failures.length === 0 ? [`${stepOf(s.hash)}: exit ${exit}`] : failures.map((f) => f.test);
    writeRun(runs, { test_set: s.set, code: s.code, knowledge: s.knowledge, tools: s.tools, environment: chosen.environment, seed: s.seed, outcome, failed, ms, head, at });
    return { set: s.set, reasons: s.reasons, hash: s.hash, key: s.key, seed: s.seed, exit, ms, outcome, failed };
  });
  let ok = results.every((r) => r.exit === 0);
  const ran = new Set(running.map((s) => s.set));
  const skipped = chosen.sets.filter((s) => !ran.has(s.set)).map((s) => s.set);
  const outcome = { base: chosen.base, sets, skipped, steps: results.slice(0, steps.length), log };
  if (gating) {
    const differs = (s) => gating.recorded.get(s.set) && gating.recorded.get(s.set).outcome !== s.outcome;
    gating.gate.mismatches = sets.filter(differs).map((s) => ({ set: s.set, key: s.key, recorded: gating.recorded.get(s.set).outcome, outcome: s.outcome }));
    outcome.gate = gating.gate;
  }
  // --ready (S0-44): the mutants of the changed hunks of src/, once the tests are green — a mutant of a red run proves nothing.
  let red = "";
  if (readyOf(args)) {
    const { mutation } = await import("./mutate.mjs");
    const { output = "", ...mutants } = ok ? await mutation({ dir: process.cwd(), base: chosen.base, chosen }) : { error: "the tests are red: no mutants run" };
    if (mutants.error) ok = false;
    if (output !== "") red = `# mutants: a test set group without a mutant\n${output}\n`;
    outcome.mutants = mutants;
  }
  finish(log, `${text}${red}`, { outcome: ok ? "passed" : "failed", ...outcome }, ok);
}
