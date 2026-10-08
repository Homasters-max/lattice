// `npm run prove --ready` mutates the changed hunks of src/ (S0-44): each operator makes mutants of the code it knows,
// a mutant runs against the test sets that reach its file, and its outcome — killed by a named test, survived, stopped
// over its budget — goes to the report; a cache keeps the outcome while the mutant and its test sets stay the same. `mutate --at` runs one mutant
// at a line. These cases run prove on a throwaway repository: its steps stand in for those of verify, and its test
// runner, in place of vitest, runs the cases a test file exports and writes the JSON report vitest writes.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPERATORS } from "../../scripts/mutants.mjs";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const git = program("git");
const prove = program("scripts/prove.mjs");
const mutate = program("scripts/mutate.mjs");
const stands: Scratch[] = [];
afterAll(() => stands.forEach((s) => s.remove()));

const STEPS = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build"];

// The runner of the stand: the cases each test file of the folders it is given exports, in order, up to the first that fails.
const RUNNER = `import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith("--outputFile="))?.slice("--outputFile=".length);
const results = [];
let failed = false;
for (const folder of args.filter((a) => a.startsWith("test/")))
  for (const name of existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".test.ts")).sort() : []) {
    const file = resolve(folder, name);
    const { cases } = await import(pathToFileURL(file).href);
    const assertionResults = [];
    for (const [fullName, run] of Object.entries(cases)) {
      if (failed) break;
      try {
        run();
        assertionResults.push({ fullName, status: "passed" });
      } catch (error) {
        failed = true;
        assertionResults.push({ fullName, status: "failed", failureMessages: [String(error)] });
      }
    }
    results.push({ name: file, status: failed ? "failed" : "passed", assertionResults });
  }
if (out) writeFileSync(out, JSON.stringify({ testResults: results }));
process.exit(failed ? 1 : 0);
`;

// Code with a site of every operator; src/kernel/ops.ts has tests that see each mutant, src/trust/ops.ts has none.
const OPS = `const reject = (rule: string, place: object) => ({ rule, ...place });
export function refusal(n: number): number {
  if (n === 0) throw new Error("ST-17: zero");
  return n;
}
export function returned(ok: boolean): object | boolean {
  if (!ok) return reject("ST-17", { path: "p" });
  return ok;
}
export const chosen = (ok: boolean) => (ok ? ok : reject("ST-17", { id: "c" }));
export const logical = (a: boolean, b: boolean) => a && b;
export const boundary = (n: number) => n < 10;
export const field = (intent: string) => reject("ST-17", { intent });
const hashOf = (kind: string, body: object) => kind + "|" + JSON.stringify(body);
export const hashed = (kind: string, name: string) => hashOf(kind, { name });
const signWith = (body: string, key: string) => key + ":" + body;
export const signed = (body: string, key: string) => signWith(body, key);
export const sorted = (xs: number[]) => [...xs].sort((a, b) => b - a);
`;
const BOUNDARY_LINE = OPS.split("\n").findIndex((l) => l.includes("n < 10")) + 1;

// The kinds of site an operator has, each a mutant of its own: a refusal is a throw, a returned call of reject and the
// refusing branch of a conditional; a hash input is a field of a literal and an argument in the place of another.
const SITES: readonly { operator: string; before: string; after: string }[] = [
  { operator: "refusal", before: 'throw new Error("ST-17: zero");', after: ";" },
  { operator: "refusal", before: 'return reject("ST-17", { path: "p" });', after: ";" },
  { operator: "refusal", before: 'ok ? ok : reject("ST-17", { id: "c" })', after: "(ok)" },
  { operator: "hash-input", before: "{ name }", after: "{ }" },
  { operator: "hash-input", before: "body", after: "key" },
  { operator: "hash-input", before: "key", after: "body" },
];

const STRONG = `import { boundary, chosen, field, hashed, logical, refusal, returned, signed, sorted } from "../../src/kernel/ops.ts";
const same = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + " is not " + JSON.stringify(b));
};
export const cases = {
  "refusal: refuses zero": () => same((() => { try { refusal(0); return false; } catch { return true; } })(), true),
  "refusal: returns the refusal": () => [same(returned(false), { rule: "ST-17", path: "p" }), same(returned(true), true)],
  "refusal: the refusing branch": () => [same(chosen(false), { rule: "ST-17", id: "c" }), same(chosen(true), true)],
  "logical: both sides count": () => [same(logical(true, false), false), same(logical(false, true), false)],
  "boundary: ten is out": () => same(boundary(10), false),
  "field: names its place": () => same(field("i1"), { rule: "ST-17", intent: "i1" }),
  "hash: covers each field": () => same(hashed("k", "n"), 'k|{"name":"n"}'),
  "signature: the body and the key in place": () => same(signed("b", "k"), "k:b"),
  "sort: descending": () => same(sorted([1, 3, 2]), [3, 2, 1]),
};
`;
const WEAK = `import * as ops from "../../src/trust/ops.ts";
export const cases = { "loads": () => { if (typeof ops.refusal !== "function") throw new Error("no refusal"); } };
`;

const FILES: { readonly [path: string]: string } = {
  ".gitignore": ".lattice/\ntmp/\n",
  "package.json": JSON.stringify({
    name: "stand",
    private: true,
    scripts: { ...Object.fromEntries(STEPS.map((s) => [s, "node -e 0"])), test: "node --experimental-strip-types --no-warnings runner.mjs" },
  }),
  "package-lock.json": "{}\n",
  "runner.mjs": RUNNER,
  "src/kernel/keep.ts": "export const keep = 1;\n",
  "test/kernel/ops.test.ts": STRONG,
  "test/trust/ops.test.ts": WEAK,
  "test/structure/s.test.ts": "export const cases = {};\n",
};

let stand: Scratch;

// One stand for the cases of this file, which run one after another: a run of prove costs some seconds of processes,
// and a later case finds in the cache what an earlier one ran — the cases read the outcomes, not whether they ran.
beforeAll(() => {
  stand = scratch("mutate-");
  stands.push(stand);
  for (const [path, text] of Object.entries(FILES)) stand.write(path, text);
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base"]])
    expect(git.run(args, { cwd: stand.dir }).status).toBe(0);
  // The change: the code of both files is new against the base, so each line of it is in a changed hunk.
  stand.write("src/kernel/ops.ts", OPS);
  stand.write("src/trust/ops.ts", OPS);
});

type Entry = { id: string; file: string; line: number; operator: string; before: string; after: string; tests: string[]; outcome: string; killer: string | null; cached: boolean };
type Summary = { report: string; total: number; killed: number; survived: number; ran: number; survivors: string[] };

// The copies of the working tree go to the temporary folder of the system: here, a folder of the stand.
const env = (extra: NodeJS.ProcessEnv = {}) => {
  const tmp = stand.path("tmp");
  return { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, ...extra };
};

async function ready(extra: NodeJS.ProcessEnv = {}, args: readonly string[] = ["--ready"]): Promise<{ status: number; mutants: Summary; entries: Entry[] }> {
  const ran = await prove.start(["--base", "main", ...args], { cwd: stand.dir, env: env(extra) });
  const last = JSON.parse(ran.stdout.trimEnd().split("\n").at(-1) ?? "") as { mutants: Summary };
  const report = JSON.parse(stand.text(".lattice/mutants.json")) as { mutants: Entry[] };
  return { status: ran.status, mutants: last.mutants, entries: report.mutants };
}

describe("prove --ready, the operators", { timeout: 120_000 }, () => {
  it("every operator makes a mutant that a test which sees it kills and that survives without one", async () => {
    const run = await ready();
    expect(run.status).toBe(0);
    for (const operator of OPERATORS) {
      const of = (file: string) => run.entries.filter((e) => e.operator === operator && e.file === file).map((e) => e.outcome);
      expect([operator, of("src/kernel/ops.ts").length > 0, of("src/trust/ops.ts").length > 0]).toEqual([operator, true, true]);
      expect([operator, ...new Set(of("src/kernel/ops.ts"))]).toEqual([operator, "killed"]);
      expect([operator, ...new Set(of("src/trust/ops.ts"))]).toEqual([operator, "survived"]);
    }
    for (const site of SITES) {
      const of = (file: string) => run.entries.filter((e) => e.file === file && e.operator === site.operator && e.before === site.before && e.after === site.after).map((e) => e.outcome);
      expect([site, of("src/kernel/ops.ts"), of("src/trust/ops.ts")]).toEqual([site, ["killed"], ["survived"]]);
    }
    const boundary = run.entries.find((e) => e.file === "src/kernel/ops.ts" && e.operator === "boundary")!;
    expect(boundary).toMatchObject({ line: BOUNDARY_LINE, tests: ["kernel"], killer: "test/kernel/ops.test.ts > boundary: ten is out" });
    expect(run.mutants).toMatchObject({ total: run.entries.length, killed: run.entries.length / 2, survived: run.entries.length / 2, ran: run.entries.length });
    expect(run.mutants.survivors).toHaveLength(run.entries.length / 2);
  });
});

describe("prove --ready, the cache", { timeout: 120_000 }, () => {
  it("a second run without edits runs no mutant; an edit of a test set runs its mutants again", async () => {
    const first = await ready();
    // npm run prove --ready gives the flag to the script as npm_config_ready.
    const second = await ready({ npm_config_ready: "true" }, []);
    expect(second.mutants.ran).toBe(0);
    expect(second.entries.map((e) => [e.id, e.outcome, e.cached])).toEqual(first.entries.map((e) => [e.id, e.outcome, true]));
    stand.write("test/kernel/ops.test.ts", `${STRONG}// one more line\n`);
    const third = await ready();
    const kernel = third.entries.filter((e) => e.file === "src/kernel/ops.ts");
    expect(third.mutants.ran).toBe(kernel.length);
    expect(third.entries.map((e) => [e.file, e.cached])).toEqual(third.entries.map((e) => [e.file, e.file === "src/trust/ops.ts"]));
  });
});

describe("mutate --at", { timeout: 120_000 }, () => {
  it("runs one mutant at a line and names the test that kills it; refuses a line outside src/", async () => {
    const ran = await mutate.start(["--at", `src/kernel/ops.ts:${BOUNDARY_LINE}`, "--base", "main"], { cwd: stand.dir, env: env() });
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout.trim())).toMatchObject({ outcome: "passed", mutant: { operator: "boundary", outcome: "killed", killer: "test/kernel/ops.test.ts > boundary: ten is out" } });
    const outside = await mutate.start(["--at", "runner.mjs:1"], { cwd: stand.dir, env: env() });
    expect([outside.status, (JSON.parse(outside.stdout.trim()) as { outcome: string }).outcome]).toEqual([1, "failed"]);
    expect(stand.exists(join(".lattice", "mutate", "cache.json"))).toBe(true);
  });
});

// Code whose refusal keeps a loop finite: without it, the test of the refusal never ends.
const LOOP = `export function countdown(n: number): number {
  if (n < 0) throw new Error("ST-17: negative");
  let steps = 0;
  for (let i = n; i !== 0; i--) steps++;
  return steps;
}
`;
const LOOP_TEST = `import { countdown } from "../../src/kernel/loop.ts";
export const cases = {
  "countdown: refuses a negative": () => {
    try { countdown(-1); } catch { return; }
    throw new Error("no refusal");
  },
};
`;

describe("mutate, the budget", { timeout: 120_000 }, () => {
  // Last in this file: the new test changes the kernel test set, which the cases above read.
  it("stops a mutant that runs over the budget: budget-exceeded, no test named", async () => {
    stand.write("src/kernel/loop.ts", LOOP);
    stand.write("test/kernel/loop.test.ts", LOOP_TEST);
    // The least budget is 1 s instead of 10 s: the mutant never ends, so the case waits for its budget, not for 10 s.
    const ran = await mutate.start(["--at", "src/kernel/loop.ts:2", "--operator", "refusal", "--base", "main"], { cwd: stand.dir, env: env({ MUTATE_BUDGET_MIN_MS: "1000" }) });
    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout.trim())).toMatchObject({ outcome: "passed", mutant: { operator: "refusal", outcome: "budget-exceeded", killer: null } });
  });
});
