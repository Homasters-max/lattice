#!/usr/bin/env node
// mutate: the run of mutants (S0-44) — the step `--ready` of scripts/prove.mjs and, for a reviewer, one mutant at a line.
// A mutant (scripts/mutants.mjs) runs against the test sets that reach its file — those whose tests import or start it,
// fixtures among them when they do (scripts/prove.mjs, reachOf) — in one run of vitest with --bail, the seed taken from
// the hashes of those sets. The runs go in a pool of copies of the working tree outside the repository, node_modules
// linked; each test set group first runs without a mutant: a red baseline proves nothing, and its time sets the budget
// of a mutant. The outcome of a mutant: killed — the run failed, the first failed test named; survived — it passed,
// or no test set reaches the file; budget-exceeded — the run went over the budget and was stopped.
// The cache .lattice/mutate/cache.json keeps the outcome by (hash of the mutant, hash of its test sets): a mutant does
// not run again while its inputs are the same. The report of --ready is .lattice/mutants.json:
//   {"head", "dirty", "base", "mutants": [{"id", "file", "line", "operator", "code", "before", "after", "tests",
//    "outcome", "killer", "cached"}]}
// One mutant at a line, its outcome as the last line of stdout — the mutation a reviewer makes outside the report:
//   npm run mutate -- --at <src/file.ts:line> [--operator <operator>] [--base <ref>]
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { delimiter, dirname, join, posix, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { clearTimeout, setTimeout } from "node:timers";
import { changedMutants, mutantsOf, mutate, OPERATORS } from "./mutants.mjs";
import { filtersOf, seedOf } from "./paths.mjs";
import { flagOf, isMain } from "./verify.mjs";
// scripts/prove.mjs is imported by the command line below only: prove imports this module for --ready, and two modules
// that import each other while one awaits at its top level never finish loading.

const POOL_MAX = 4;
const BUDGET_FACTOR = 3;
const BUDGET_MIN_MS = 10_000;
const OUTPUT_KEPT = 4000;
const SURVIVORS_LISTED = 20;
export const OUTCOMES = ["killed", "survived", "budget-exceeded"];

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const slash = (p) => p.replaceAll("\\", "/");
const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};

/** The test sets that reach `file`, by name, and the key of the group: the hash of their names and input hashes. */
function testsOf(chosen, file) {
  const sets = chosen.sets.filter((s) => s.reach.includes(file)).sort((a, b) => (a.set < b.set ? -1 : 1));
  const key = sha256(sets.map((s) => `${s.set}\0${s.hash}\n`).join(""));
  return { sets, key, seed: seedOf(`sha256:${key}`) };
}

/** The paths under `root`, relative with `/`, but its node_modules. */
function walk(root, at = "") {
  const out = [];
  for (const e of existsSync(join(root, at)) ? readdirSync(join(root, at), { withFileTypes: true }) : []) {
    const path = at ? `${at}/${e.name}` : e.name;
    if (path === "node_modules") continue;
    if (e.isDirectory()) out.push(...walk(root, path));
    else out.push(path);
  }
  return out;
}

/** The copy `to` holds the files of `dir` and nothing else; node_modules is a link to that of `dir`. */
function syncCopy(dir, files, to) {
  mkdirSync(to, { recursive: true });
  const wanted = new Set(files);
  for (const p of walk(to)) if (!wanted.has(p)) rmSync(join(to, p), { force: true });
  for (const p of files) {
    const bytes = readFileSync(join(dir, p));
    const target = join(to, p);
    if (existsSync(target) && readFileSync(target).equals(bytes)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  if (existsSync(join(dir, "node_modules")) && !existsSync(join(to, "node_modules"))) symlinkSync(join(dir, "node_modules"), join(to, "node_modules"), "junction");
}

/** Stops a run and what it started. */
function kill(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

/** The first failed test of the JSON report of vitest, `<file> > <name>`, or the file that failed to run. */
function killerOf(json, copy) {
  for (const file of json?.testResults ?? []) {
    const at = slash(relative(copy, file.name ?? ""));
    const failed = (file.assertionResults ?? []).find((a) => a.status === "failed");
    if (failed) return `${at} > ${failed.fullName}`;
    if (file.status === "failed") return `${at}: ${String(file.message ?? "").split("\n")[0]}`;
  }
  return null;
}

/**
 * The command of the npm script `test` of the copy and its environment: the script runs as npm would run it — in a
 * shell, node_modules/.bin first on the path — without npm itself, whose start costs more than a small run of tests.
 */
function testCommand(copy, args, seed) {
  const script = readJson(join(copy, "package.json"), {}).scripts?.test ?? "vitest run";
  const path = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const env = { ...process.env, [path]: `${join(copy, "node_modules", ".bin")}${delimiter}${process.env[path] ?? ""}`, LATTICE_SEED: String(seed) };
  return { command: `${script} ${args.join(" ")}`, env };
}

/** Runs the tests of `group` in the copy: `{exit, ms, timedOut, killer, output}`. */
function runTests(copy, group, { budget, files, json, workers }) {
  rmSync(json, { force: true });
  const filters = group.sets.flatMap((s) => filtersOf(s.set, files));
  const { command, env } = testCommand(copy, ["--bail=1", "--reporter=json", `"--outputFile=${json}"`, `--maxWorkers=${workers}`, ...filters], group.seed);
  return new Promise((done) => {
    const start = performance.now();
    let output = "";
    let timedOut = false;
    const child = spawn(command, { cwd: copy, shell: true, stdio: ["ignore", "pipe", "pipe"], env, detached: process.platform !== "win32", windowsHide: true });
    const keep = (chunk) => (output = `${output}${chunk}`.slice(-OUTPUT_KEPT));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = budget === null ? null : setTimeout(() => ((timedOut = true), kill(child)), budget);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const exit = code ?? 1;
      done({ exit, ms: Math.round(performance.now() - start), timedOut, killer: exit === 0 ? null : (killerOf(readJson(json, null), copy) ?? `exit ${exit}`), output });
    });
  });
}

/** Runs `fn(item, worker)` over `items` with `workers` workers; resolves with the results in the order of the items. */
async function pool(items, workers, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async (w) => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], w);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, (_, w) => worker(w)));
  return results;
}

/**
 * Runs `mutants` in the repository at `dir`, `chosen` being the test sets of scripts/prove.mjs select:
 * `{entries: [entry of the report], ran}` or `{error}` when a test set group is red without a mutant.
 */
export async function runMutants({ dir, chosen, mutants }) {
  const cacheFile = join(dir, ".lattice", "mutate", "cache.json");
  const cache = readJson(cacheFile, {});
  const jobs = mutants.map((m) => ({ m, group: testsOf(chosen, m.file) }));
  const pending = jobs.filter((j) => j.group.sets.length > 0 && cache[`${j.m.id}:${j.group.key}`] === undefined);
  const groups = [...new Map(pending.map((j) => [j.group.key, j.group])).values()];
  const workers = Math.max(1, Math.min(POOL_MAX, Math.floor(availableParallelism() / 2), Math.max(pending.length, 1)));
  const copies = Array.from({ length: pending.length ? workers : 0 }, (_, w) => join(tmpdir(), "lattice-mutate", sha256(resolve(dir)).slice(0, 12), `w${w}`));
  for (const copy of copies) syncCopy(dir, chosen.files, copy);
  const options = (w, budget) => ({ budget, files: chosen.files, json: `${copies[w]}.json`, workers: Math.max(1, Math.floor(availableParallelism() / workers)) });
  const baselines = await pool(groups.filter((g) => cache[`baseline:${g.key}`] === undefined), workers, async (g, w) => ({ g, r: await runTests(copies[w], g, options(w, null)) }));
  const red = baselines.find(({ r }) => r.exit !== 0);
  if (red) return { error: `baseline red: test sets ${red.g.sets.map((s) => s.set).join(", ")} fail without a mutant — ${red.r.killer}`, output: red.r.output };
  for (const { g, r } of baselines) cache[`baseline:${g.key}`] = { ms: r.ms };
  const texts = new Map();
  const textOf = (file) => texts.get(file) ?? texts.set(file, readFileSync(join(dir, file), "utf8")).get(file);
  await pool(pending, workers, async ({ m, group }, w) => {
    const target = join(copies[w], m.file);
    writeFileSync(target, mutate(textOf(m.file), m));
    const budget = Math.max(BUDGET_MIN_MS, BUDGET_FACTOR * cache[`baseline:${group.key}`].ms);
    const r = await runTests(copies[w], group, options(w, budget));
    writeFileSync(target, textOf(m.file));
    cache[`${m.id}:${group.key}`] = { outcome: r.timedOut ? "budget-exceeded" : r.exit === 0 ? "survived" : "killed", killer: r.timedOut ? null : r.killer };
  });
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
  const ran = new Set(pending.map((j) => j.m.id));
  const entries = jobs.map(({ m, group }) => {
    const { outcome, killer } = group.sets.length === 0 ? { outcome: "survived", killer: null } : cache[`${m.id}:${group.key}`];
    const { id, file, line, operator, code, before, after } = m;
    return { id, file, line, operator, code, before, after, tests: group.sets.map((s) => s.set), outcome, killer, cached: group.sets.length > 0 && !ran.has(m.id) };
  });
  return { entries, ran: ran.size };
}

/**
 * The step --ready of prove: the mutants of the changed hunks of src/ against `base`, run, the report written to
 * .lattice/mutants.json; → the summary for the last line of prove, or `{error}`.
 */
export async function mutation({ dir, base, chosen }) {
  const { mutants } = changedMutants({ dir, base });
  const result = await runMutants({ dir, chosen, mutants });
  if (result.error) return { error: result.error };
  const report = join(dir, ".lattice", "mutants.json");
  const head = git(dir, "rev-parse", "HEAD").trim();
  const dirty = git(dir, "status", "--porcelain").trim() !== "";
  mkdirSync(dirname(report), { recursive: true });
  writeFileSync(report, `${JSON.stringify({ head, dirty, base, mutants: result.entries }, null, 2)}\n`);
  const count = (o) => result.entries.filter((e) => e.outcome === o).length;
  const survivors = result.entries.filter((e) => e.outcome === "survived").map((e) => `${e.id} ${e.file}:${e.line} ${e.operator}: ${e.before} → ${e.after}`);
  return {
    report, total: result.entries.length, killed: count("killed"), survived: count("survived"), "budget-exceeded": count("budget-exceeded"), ran: result.ran,
    survivors: survivors.length > SURVIVORS_LISTED ? [...survivors.slice(0, SURVIVORS_LISTED), `and ${survivors.length - SURVIVORS_LISTED} more`] : survivors,
  };
}

/** `--at <file:line>` → `{file, line}` of a file of src/ from the root, or an error. */
function placeOf(at) {
  const m = /^(.+):(\d+)$/.exec(at ?? "");
  const file = m ? posix.normalize(slash(m[1])) : null;
  if (!m || !/^src\//.test(file)) return { error: "--at <src/file.ts:line>: a line of a file of src/ — mutants outside src/ are not made (S0-44)" };
  return { file, line: Number(m[2]) };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const print = (value, ok) => {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    process.exitCode = ok ? 0 : 1;
  };
  const at = placeOf(flagOf(args, "at", null));
  const operator = flagOf(args, "operator", null);
  if (at.error) print({ outcome: "failed", error: at.error }, false);
  else if (operator !== null && !OPERATORS.includes(operator)) print({ outcome: "failed", error: `--operator: ${OPERATORS.join(" | ")}` }, false);
  else if (!existsSync(at.file)) print({ outcome: "failed", error: `no file ${at.file}` }, false);
  else {
    const all = mutantsOf(process.cwd(), at.file, readFileSync(at.file, "utf8"), (n) => n === at.line);
    const picked = all.filter((m) => operator === null || m.operator === operator);
    if (picked.length === 0) print({ outcome: "failed", error: `no mutant at ${at.file}:${at.line}${operator ? ` by ${operator}` : ""}`, operators: [...new Set(all.map((m) => m.operator))] }, false);
    else {
      const result = await runMutants({ dir: process.cwd(), chosen: (await import("./prove.mjs")).select({ base: flagOf(args, "base", "origin/main") }), mutants: [picked[0]] });
      if (result.error) print({ outcome: "failed", error: result.error }, false);
      else print({ outcome: "passed", mutant: result.entries[0], others: picked.slice(1).map((m) => `${m.operator}: ${m.before} → ${m.after}`) }, true);
    }
  }
}
