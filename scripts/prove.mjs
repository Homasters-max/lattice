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
//   npm run prove [--ready] [-- --base <ref>]
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import ts from "typescript";
import { filtersOf, FITNESS, owns, seedOf, testSetOf } from "./paths.mjs";
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
 * Each test set of the repository at `dir` against the merge base of `base` and HEAD: `{set, run, reasons, hash, seed,
 * reach}`; `run` — fitness, or the hash of its input differs from the base; `reach` — what its tests run as code.
 */
export function select({ dir = process.cwd(), base = "origin/main" } = {}) {
  const from = git(dir, "merge-base", base, "HEAD").trim();
  const tree = treeOf(dir, from);
  const sets = setsOf(tree).map((set) => {
    const input = inputOf(tree, set);
    const paths = [...input.keys()].sort();
    const hash = hashOf(paths, tree.blob);
    const changed = hash === hashOf(paths, (p) => tree.base.get(p) ?? "-") ? [] : paths.filter((p) => tree.blob(p) !== (tree.base.get(p) ?? "-"));
    const fitness = FITNESS.includes(set);
    return { set, run: fitness || changed.length > 0, reasons: fitness ? [FITNESS_REASON] : reasonsOf(input, changed), hash, seed: seedOf(hash), reach: reachOf(tree, set) };
  });
  return { base: from, sets, files: tree.files };
}

// `npm run prove --ready` gives npm the flag, and npm gives it to the script as npm_config_ready; `-- --ready` gives it as is.
const readyOf = (args) => args.includes("--ready") || process.env.npm_config_ready === "true";

if (isMain(import.meta.url)) {
  const log = resolve(".lattice", "prove.log");
  const args = process.argv.slice(2);
  let chosen;
  try {
    chosen = select({ base: flagOf(args, "base", "origin/main") });
  } catch (error) {
    finish(log, "", { outcome: "failed", error: String(error instanceof Error ? error.message : error).trim(), log }, false);
    process.exit();
  }
  const running = chosen.sets.filter((s) => s.run);
  // Test sets of one hash — the fitness sets own the whole repository — share a seed and one run of vitest. The runs
  // go one after another, beside the other steps: vitest runs the files of a run in parallel itself.
  const runs = Map.groupBy(running, (s) => s.hash);
  const stepOf = (hash) => `test ${runs.get(hash).map((s) => s.set).join(" ")}`;
  const tests = [...runs].map(([hash, group]) => ({
    step: stepOf(hash),
    command: `npm run --silent test -- ${group.flatMap((s) => filtersOf(s.set, chosen.files)).join(" ")}`,
    env: { LATTICE_SEED: String(group[0].seed) },
    queue: "test",
  }));
  const steps = STEPS.filter((step) => step !== "test").map((step) => ({ step, command: `npm run --silent ${step}` }));
  const { results, text } = await runSteps([...steps, ...tests]);
  const resultOf = new Map(results.map((r) => [r.step, r]));
  const sets = running.map(({ set, reasons, hash, seed }) => ({ set, reasons, hash, seed, exit: resultOf.get(stepOf(hash)).exit, ms: resultOf.get(stepOf(hash)).ms }));
  let ok = results.every((r) => r.exit === 0);
  const skipped = chosen.sets.filter((s) => !s.run).map((s) => s.set);
  const outcome = { base: chosen.base, sets, skipped, steps: results.slice(0, steps.length), log };
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
