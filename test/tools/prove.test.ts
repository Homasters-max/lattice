// scripts/prove.mjs proves what a change touches (S0-42): every test set of fitness, and the test sets whose input —
// owned files, imports, programs, knowledge, the config of a run — has another hash than at the base. The classifier
// of scripts/paths.mjs says what a path is. These cases run prove on a throwaway repository whose npm scripts stand in
// for the steps of verify and for vitest.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { classOf, FITNESS, isTool, owns, ST_BY_CLASS, testSetOf } from "../../scripts/paths.mjs";
import { seedOf, select } from "../../scripts/prove.mjs";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const git = program("git");
const prove = program("scripts/prove.mjs");
const stands: Scratch[] = [];
afterAll(() => stands.forEach((s) => s.remove()));

// A step prints its name; `test` prints its filters and the seed it got, and fails when a filter names the set in `red`.
const STAND = `import { existsSync, readFileSync } from "node:fs";
const [step, ...filters] = process.argv.slice(2);
console.log(step + " " + filters.join(" ") + " seed=" + process.env.LATTICE_SEED);
const red = existsSync("red") ? readFileSync("red", "utf8").trim() : null;
process.exit(red !== null && filters.some((f) => f.startsWith("test/" + red + "/")) ? 1 : 0);
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
  sets: { set: string; reasons: string[]; hash: string; seed: number; exit: number }[];
  skipped: string[];
  steps: { step: string; exit: number }[];
  log: string;
};

async function proveRun(): Promise<{ status: number; report: Report }> {
  const ran = await prove.start(["--base", "main"], { cwd: stand.dir });
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
