// scripts/prove.mjs proves what a change touches (S0-42): every test set of fitness, and the test sets whose input —
// owned files, imports, programs, knowledge, the config of a run — has another hash than at the base. The classifier
// of scripts/paths.mjs says what a path is. These cases run prove on a throwaway repository whose npm scripts stand in
// for the steps of verify and for vitest.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { classOf, FITNESS, isTool, owns, ST_BY_CLASS, testSetOf } from "../../scripts/paths.mjs";
import { seedOf, select } from "../../scripts/prove.mjs";
import { keyOf, type Environment, type Run } from "../../scripts/runs.mjs";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const git = program("git");
const prove = program("scripts/prove.mjs");
const stands: Scratch[] = [];
afterAll(() => stands.forEach((s) => s.remove()));

// A step prints its name; `test` prints its filters and the seed it got. Each line of the file `red` makes a run fail:
// `<set>` — the test set fails, `<set> timeout` — it goes over its budget, `step:<name>` — the step fails. A failed test
// set goes into the JSON report vitest would write to --outputFile.json.
const STAND = `import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [step, ...args] = process.argv.slice(2);
const filters = args.filter((a) => !a.startsWith("--"));
const json = args.find((a) => a.startsWith("--outputFile.json="))?.slice("--outputFile.json=".length);
console.log(step + " " + filters.join(" ") + " seed=" + process.env.LATTICE_SEED);
const red = existsSync("red") ? readFileSync("red", "utf8").trim().split("\\n").map((l) => l.split(" ")) : [];
if (red.some(([what]) => what === "step:" + step)) process.exit(1);
const hit = red.filter(([set]) => filters.some((f) => f.startsWith("test/" + set + "/")));
const result = ([set, how]) => ({
  name: join(process.cwd(), "test", set, "x.test.ts").replaceAll("\\\\", "/"), status: "failed", message: "",
  assertionResults: [{ status: "failed", fullName: "x " + (how ?? "fails"), failureMessages: [how === "timeout" ? "Error: Test timed out in 30000ms." : "AssertionError: boom"] }],
});
if (json) writeFileSync(json, JSON.stringify({ success: hit.length === 0, testResults: hit.map(result) }));
process.exit(hit.length ? 1 : 0);
`;

const STEPS = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build", "test"];

const FILES: { readonly [path: string]: string } = {
  ".gitignore": ".lattice/\nred\n",
  "package.json": JSON.stringify({ name: "stand", private: true, scripts: Object.fromEntries(STEPS.map((s) => [s, `node stand.mjs ${s}`])) }),
  "package-lock.json": "{}\n",
  "stand.mjs": STAND,
  "docs/design/01-a.md": "# A\n",
  "src/kernel/a.ts": "export const a = 1;\n",
  "src/ledger/b.ts": 'import { a } from "../kernel/a.js";\nexport const b = a + 1;\n',
  "src/trust/c.ts": "export const c = 3;\n",
  "test/support/files.ts": "export const knowledge = {};\n",
  "test/support/setup.ts": 'import { seed } from "./seed.js";\nexport const s = seed;\n',
  "test/support/seed.ts": "export const seed = 1;\n",
  "test/kernel/a.test.ts": 'import { a } from "../../src/kernel/a.js";\nexport const t = a;\n',
  "test/ledger/b.test.ts": 'import { b } from "../../src/ledger/b.js";\nexport const t = b;\n',
  "test/ledger/run.test.ts": 'const run = program("scripts/run.mjs");\nexport const t = run;\n',
  "test/trust/c.test.ts": 'import { knowledge } from "../support/files.js";\nimport { c } from "../../src/trust/c.js";\nexport const t = [knowledge, c];\n',
  "test/structure/s.test.ts": "export const t = 0;\n",
  "test/tools/t.test.ts": 'export const t = "t";\n',
  "plan/tools/t.mjs": "export const t = 1;\n",
  "scripts/s.mjs": "export const s = 1;\n",
  "scripts/run.mjs": 'import { lib } from "./lib.mjs";\nexport const run = lib;\n',
  "scripts/lib.mjs": "export const lib = 1;\n",
  "discussion/tools/l.mjs": "export const l = 1;\n",
  "AGENTS.md": "# Agents\n",
  "CONVENTIONS.md": "# Conventions\n",
  ".claude/skills/s/SKILL.md": "# Skill\n",
  "plan/STATUS.md": "# Status\n",
};

let stand: Scratch;

/** Runs git in the stand; each command must succeed. */
function inStand(...commands: readonly (readonly string[])[]) {
  for (const args of commands) expect(git.run(args, { cwd: stand.dir }).status).toBe(0);
}

const COMMIT = ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-a", "-m"];

beforeEach(() => {
  stand = scratch("prove-");
  stands.push(stand);
  for (const [path, text] of Object.entries(FILES)) stand.write(path, text);
  inStand(["init", "-q", "-b", "main"], ["add", "-A"], [...COMMIT, "base"]);
});

/** The sets prove runs after the edits, with their reasons; the others are left out. */
function chosen(edits: { readonly [path: string]: string }) {
  for (const [path, text] of Object.entries(edits)) stand.write(path, text);
  return Object.fromEntries(select({ dir: stand.dir, base: "main" }).sets.filter((s) => s.run).map((s) => [s.set, s.reasons]));
}

const FITNESS_REASON = ["fitness: runs on every change request (ST-12)"];

describe("the classifier of paths", () => {
  it("ST-12: names the test set of a file of test/ by its folder, smoke for the root, and the fitness sets", () => {
    expect(["test/kernel/canon.test.ts", "test/fixtures/KR-04/pass/a.json", "test/smoke.test.ts", "src/kernel/canon.ts"].map(testSetOf)).toEqual(["kernel", "fixtures", "smoke", null]);
    expect(FITNESS).toEqual(["structure", "fixtures", "e2e", "smoke"]);
  });

  it("ST-18: a test set owns its folder and what it reads; a fitness set owns the repository", () => {
    expect([owns("kernel", "test/kernel/a.test.ts"), owns("kernel", "test/vectors/nfc.json"), owns("kernel", "test/ledger/a.test.ts"), owns("kernel", "src/kernel/a.ts")]).toEqual([true, true, false, false]);
    expect([owns("structure", "src/kernel/a.ts"), owns("smoke", "package.json"), owns("tools", "plan/dev-loop.md")]).toEqual([true, true, true]);
  });

  it("ST-12: the development tools are plan/tools/**, scripts/** and discussion/tools/**", () => {
    expect(["plan/tools/dev-loop.mjs", "scripts/prove.mjs", "discussion/tools/lint-ids.mjs", "plan/dev-loop.md", "src/cli/main.ts"].map(isTool)).toEqual([true, true, true, false, false]);
  });

  it("ST-12: gives the class of a path and the rows of ST of a class, as the loop reads them", () => {
    expect(["docs/design/13-structure.md", "scripts/prove.mjs", "test/x.test.ts", "package.json", "CONVENTIONS.md", "plan/phases/S0/tasks/S0-01.md", "gen/x.ts", "README.md"].map(classOf)).toEqual([
      "design", "code", "tests", "config", "conventions", "task", "generated", "text",
    ]);
    expect(ST_BY_CLASS.tests).toContain("ST-18");
  });
});

describe("prove, the choice of test sets by the hash of their input", () => {
  it("ST-12: runs only the fitness sets when nothing changed", () => {
    expect(chosen({})).toEqual({ structure: FITNESS_REASON });
  });

  it("ST-18: an edit of a file of a module runs its test set and those that import it, and names the import", () => {
    expect(chosen({ "src/kernel/a.ts": "export const a = 2;\n" })).toEqual({
      kernel: ["import: src/kernel/a.ts"],
      ledger: ["import: src/kernel/a.ts"],
      structure: FITNESS_REASON,
    });
  });

  it("ST-18: an edit of a file a test set owns runs that set alone", () => {
    expect(chosen({ "test/ledger/b.test.ts": 'import { b } from "../../src/ledger/b.js";\nexport const t = b + 1;\n' })).toEqual({
      ledger: ["owned: test/ledger/b.test.ts"],
      structure: FITNESS_REASON,
    });
  });

  it("ST-18: an edit of docs/design runs the test sets that read knowledge", () => {
    expect(chosen({ "docs/design/01-a.md": "# A\n\nmore\n" })).toEqual({ trust: ["knowledge: docs/design/01-a.md"], structure: FITNESS_REASON });
  });

  for (const path of ["plan/tools/t.mjs", "scripts/s.mjs", "discussion/tools/l.mjs"]) {
    it(`ST-12: an edit of ${path} runs the project tools`, () => {
      expect(chosen({ [path]: "export const changed = 2;\n" })).toEqual({ tools: [`owned: ${path}`], structure: FITNESS_REASON });
    });
  }

  for (const path of ["AGENTS.md", "CONVENTIONS.md", ".claude/skills/s/SKILL.md", "plan/STATUS.md"]) {
    it(`ST-18: an edit of ${path}, a document the tools check, runs the project tools`, () => {
      expect(chosen({ [path]: "# Changed\n" })).toEqual({ tools: [`owned: ${path}`], structure: FITNESS_REASON });
    });
  }
});

describe("prove, the input beyond the files of a test set: programs, the config of a run, the base", () => {
  it("ST-18: an edit of a program a test starts, or of what it imports, runs that test set and names the program", () => {
    expect(chosen({ "scripts/run.mjs": 'import { lib } from "./lib.mjs";\nexport const run = lib + 1;\n', "scripts/lib.mjs": "export const lib = 2;\n" })).toEqual({
      ledger: ["import: scripts/lib.mjs", "program: scripts/run.mjs"],
      tools: ["owned: scripts/lib.mjs", "owned: scripts/run.mjs"],
      structure: FITNESS_REASON,
    });
  });

  it("ST-18: an edit of a file the setup of the config imports runs every test set", () => {
    const reason = ["import: test/support/seed.ts"];
    expect(chosen({ "test/support/seed.ts": "export const seed = 2;\n" })).toEqual({ kernel: reason, ledger: reason, structure: FITNESS_REASON, tools: reason, trust: reason });
  });

  it("ST-12: the base of a change request is the merge base of --base and HEAD: a commit of the branch counts, a later commit of the base does not", () => {
    inStand(["checkout", "-q", "-b", "topic"]);
    stand.write("src/trust/c.ts", "export const c = 4;\n");
    inStand([...COMMIT, "branch"], ["checkout", "-q", "main"]);
    stand.write("src/kernel/a.ts", "export const a = 2;\n");
    inStand([...COMMIT, "main"], ["checkout", "-q", "topic"]);
    expect(chosen({})).toEqual({ trust: ["import: src/trust/c.ts"], structure: FITNESS_REASON });
  });

  it("ST-18: an edit of the lockfile runs every test set", () => {
    expect(Object.keys(chosen({ "package-lock.json": '{"lockfileVersion": 3}\n' })).sort()).toEqual(["kernel", "ledger", "structure", "tools", "trust"]);
  });

  it("ST-12: the seed of a set is the first 32 bits of its hash, as a signed integer", () => {
    expect([seedOf("sha256:00000001ff"), seedOf("sha256:ffffffff00"), seedOf("sha256:7fffffff00")]).toEqual([1, -1, 2147483647]);
  });
});

type Report = {
  outcome: string;
  sets: { set: string; reasons: string[]; hash: string; key: string; seed: number; exit: number; outcome: string; failed: string[] }[];
  skipped: string[];
  steps: { step: string; exit: number }[];
  log: string;
  gate?: { shadow: boolean; recorded: string[]; taken: string[]; ran: string[]; mismatches: { set: string; key: string; recorded: string; outcome: string }[] };
};

async function proveRun(args: readonly string[] = [], cwd = stand.dir): Promise<{ status: number; report: Report }> {
  const ran = await prove.start(["--base", "main", ...args], { cwd });
  const last = ran.stdout.trimEnd().split("\n").at(-1) ?? "";
  return { status: ran.status, report: JSON.parse(last) as Report };
}

describe("prove, the run", () => {
  it("ST-12: a red test set gives a non-zero exit and outcome failed in the last line, with the reason of each set", async () => {
    stand.write("src/ledger/b.ts", 'import { a } from "../kernel/a.js";\nexport const b = a + 2;\n');
    stand.write("red", "ledger\n");
    const run = await proveRun();
    expect(run.status).not.toBe(0);
    expect(run.report.outcome).toBe("failed");
    expect(run.report.sets.map((s) => [s.set, s.reasons, s.exit])).toEqual([
      ["ledger", ["import: src/ledger/b.ts"], 1],
      ["structure", FITNESS_REASON, 0],
    ]);
    expect(run.report.skipped).toEqual(["kernel", "tools", "trust"]);
    expect(run.report.steps.map((s) => s.step)).toEqual(STEPS.filter((s) => s !== "test"));
    const ledger = run.report.sets[0]!;
    expect(ledger.seed).toBe(seedOf(ledger.hash));
    expect(stand.text(run.report.log)).toContain(`test test/ledger/ seed=${ledger.seed}`);
  });

  it("ST-12: outcome passed and exit 0 when every set and step is green", async () => {
    const run = await proveRun();
    expect([run.status, run.report.outcome, run.report.sets.map((s) => s.set)]).toEqual([0, "passed", ["structure"]]);
  });
});

/** The key of each test set of the stand after the edits, on `environment` or on that of the run. */
function keys(edits: { readonly [path: string]: string } = {}, options: { base?: string; environment?: Environment } = {}) {
  for (const [path, text] of Object.entries(edits)) stand.write(path, text);
  return Object.fromEntries(select({ dir: stand.dir, base: options.base ?? "main", environment: options.environment }).sets.map((s) => [s.set, s.key]));
}

const head = (cwd = stand.dir) => git.run(["rev-parse", "HEAD"], { cwd }).stdout.trim();
const record = (key: string, dir = stand) => JSON.parse(dir.text(`.lattice/verify-runs/${key}.json`)) as Run;
const RECORD_FIELDS = ["test_set", "code", "knowledge", "tools", "environment", "seed", "outcome", "failed", "ms", "head", "at"];

describe("prove, the key of a record: the test set, its inputs and the environment (S0-43)", () => {
  it("ST-12: an edit of a file of a test set gives that set a new key; an edit outside its input keeps the key", () => {
    const before = keys();
    const after = keys({ "test/ledger/b.test.ts": 'import { b } from "../../src/ledger/b.js";\nexport const t = b + 1;\n' });
    expect(after.ledger).not.toBe(before.ledger);
    expect([after.kernel, after.trust, after.tools]).toEqual([before.kernel, before.trust, before.tools]);
    // A fitness set owns the whole repository: every edit is in its input.
    expect(after.structure).not.toBe(before.structure);
  });

  it("ST-12: an edit of docs/design gives a new key to the sets that read knowledge, and to them alone", () => {
    const before = keys();
    const after = keys({ "docs/design/01-a.md": "# A\n\nmore\n" });
    expect([after.trust !== before.trust, after.structure !== before.structure]).toEqual([true, true]);
    expect([after.kernel, after.ledger, after.tools]).toEqual([before.kernel, before.ledger, before.tools]);
  });

  it("ST-12: an edit of the lockfile gives every set a new key", () => {
    const before = keys();
    const after = keys({ "package-lock.json": '{"lockfileVersion": 3}\n' });
    expect(Object.keys(after).filter((set) => after[set] === before[set])).toEqual([]);
  });

  it("ST-12: another environment gives every set a new key — each of os, node and git alone", () => {
    const here = keys();
    const environment = select({ dir: stand.dir, base: "main" }).environment;
    expect(keys({}, { environment })).toEqual(here);
    const changes: readonly Partial<Environment>[] = [{ os: "plan9" }, { node: environment.node + 1 }, { git: environment.git + 1 }];
    for (const change of changes) {
      const there = keys({}, { environment: { ...environment, ...change } });
      expect([change, Object.keys(here).filter((set) => here[set] === there[set])]).toEqual([change, []]);
    }
  });

  it("ST-12: the key is of the tree, not of the base it is compared with", () => {
    stand.write("src/trust/c.ts", "export const c = 4;\n");
    inStand([...COMMIT, "next"]);
    expect(keys({}, { base: "HEAD~1" })).toEqual(keys({}, { base: "HEAD" }));
  });
});

// A case of records or of the gate runs prove two or three times in a row: under the full run that goes past the
// safeguard of one test (§8.5), so these name their own timeout, as the cases of dev-loop do (S0-45).
describe("prove, the records of its runs (S0-43)", { timeout: 60_000 }, () => {
  it("ST-12: writes a record of each test set it ran, under the key of its inputs", async () => {
    const run = await proveRun();
    expect(run.report.sets.map((s) => [s.set, s.outcome, s.failed])).toEqual([["structure", "ok", []]]);
    const [structure] = run.report.sets;
    const r = record(structure!.key);
    expect(Object.keys(r).sort()).toEqual([...RECORD_FIELDS].sort());
    expect(r).toMatchObject({ test_set: "structure", seed: structure!.seed, outcome: "ok", failed: [], head: head() });
    expect(keyOf(r)).toBe(structure!.key);
  });

  it("ST-12: run from a worktree, writes the records in the working copy of its common git dir", async () => {
    const other = scratch("prove-worktree-");
    stands.push(other);
    const linked = other.path("linked");
    inStand(["worktree", "add", "-q", "--detach", linked, "HEAD"]);
    const run = await proveRun([], linked);
    const key = run.report.sets[0]!.key;
    expect([stand.exists(`.lattice/verify-runs/${key}.json`), other.exists(`linked/.lattice/verify-runs/${key}.json`)]).toEqual([true, false]);
  });

  it("ST-12: a red test set gets outcome failed and its failed tests; one over its budget gets budget-exceeded", async () => {
    stand.write("src/ledger/b.ts", 'import { a } from "../kernel/a.js";\nexport const b = a + 2;\n');
    stand.write("red", "ledger\n");
    const red = (await proveRun()).report.sets.find((s) => s.set === "ledger")!;
    expect(record(red.key)).toMatchObject({ outcome: "failed", failed: ["test/ledger/x.test.ts > x fails"] });
    stand.write("red", "ledger timeout\n");
    const slow = (await proveRun()).report.sets.find((s) => s.set === "ledger")!;
    expect([slow.key, record(slow.key).outcome, record(slow.key).failed]).toEqual([red.key, "budget-exceeded", ["test/ledger/x.test.ts > x timeout"]]);
  });

  it("ST-12: a red step fails the record of each fitness set, and of no other: the steps are fitness tests over the same repository", async () => {
    stand.write("src/ledger/b.ts", 'import { a } from "../kernel/a.js";\nexport const b = a + 2;\n');
    stand.write("red", "step:lint\n");
    const run = await proveRun();
    expect(run.status).not.toBe(0);
    const recordOf = (set: string) => record(run.report.sets.find((s) => s.set === set)!.key);
    expect(recordOf("structure")).toMatchObject({ test_set: "structure", outcome: "failed", failed: ["step: lint"] });
    expect(recordOf("ledger")).toMatchObject({ test_set: "ledger", outcome: "ok", failed: [] });
  });
});

describe("prove --gate: the head by the records of its keys (S0-43)", { timeout: 60_000 }, () => {
  const ALL = ["kernel", "ledger", "structure", "tools", "trust"];

  it("ST-12: runs nothing — no test set, no step — when every key of the head has a record ok", async () => {
    const first = await proveRun(["--gate", "--shadow"]);
    expect([first.status, first.report.gate?.ran]).toEqual([0, ALL]);
    const gate = await proveRun(["--gate"]);
    expect([gate.status, gate.report.outcome, gate.report.sets, gate.report.steps]).toEqual([0, "passed", [], []]);
    expect(gate.report.gate).toEqual({ shadow: false, recorded: ALL, taken: ALL, ran: [], mismatches: [] });
  });

  it("ST-12: runs only the test sets whose key has no record ok, the steps with fitness alone", async () => {
    const first = await proveRun(["--gate", "--shadow"]);
    stand.remove(`.lattice/verify-runs/${first.report.sets.find((s) => s.set === "trust")!.key}.json`);
    const missing = await proveRun(["--gate"]);
    expect([missing.report.gate?.ran, missing.report.steps]).toEqual([["trust"], []]);
    // An edit is in the input of every fitness set: they run again, and the steps with them.
    stand.write("src/kernel/a.ts", "export const a = 2;\n");
    const edited = await proveRun(["--gate"]);
    expect(edited.report.gate?.ran).toEqual(["kernel", "ledger", "structure"]);
    expect(edited.report.steps.map((s) => s.step)).toEqual(STEPS.filter((s) => s !== "test"));
  });

  it("ST-12: a set whose record is not ok runs again", async () => {
    stand.write("red", "trust\n");
    await proveRun(["--gate", "--shadow"]);
    stand.remove("red");
    const gate = await proveRun(["--gate"]);
    expect([gate.status, gate.report.gate?.ran, gate.report.sets.map((s) => s.outcome)]).toEqual([0, ["trust"], ["ok"]]);
  });

  it("ST-12: in shadow runs every set though its record is ok, and names each set whose outcome differs from its record", async () => {
    const first = await proveRun(["--gate", "--shadow"]);
    const ledger = first.report.sets.find((s) => s.set === "ledger")!.key;
    stand.write("red", "ledger\n");
    const shadow = await proveRun(["--gate", "--shadow"]);
    expect(shadow.status).not.toBe(0);
    expect(shadow.report.gate).toEqual({ shadow: true, recorded: ALL, taken: [], ran: ALL, mismatches: [{ set: "ledger", key: ledger, recorded: "ok", outcome: "failed" }] });
    expect(record(ledger).outcome).toBe("failed");
  });
});
