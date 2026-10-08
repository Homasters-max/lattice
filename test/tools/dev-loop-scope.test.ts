// dev-loop scope decides the mode and the axes of a review round (plan/dev-loop.md);
// these cases build a throwaway repository and show each branch of the decision.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
const dirs: string[] = [];

type Files = { readonly [path: string]: string | null };
type Scope = {
  mode: string;
  axes: string[];
  reasons: { [axis: string]: string[] };
  stops: string[];
  triggers: { skeleton: string[]; newModules: string[]; newPorts: string[]; modules: string[] };
  expectations: string[];
  rebased: boolean;
};

function run(dir: string, cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function commit(dir: string, files: Files, message: string): string {
  for (const [path, text] of Object.entries(files)) {
    const file = join(dir, path);
    if (text === null) rmSync(file);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
  run(dir, "git", ["add", "-A"]);
  run(dir, "git", ["commit", "-q", "-m", message]);
  return run(dir, "git", ["rev-parse", "HEAD"]);
}

function repo(base: Files): { dir: string; base: string } {
  const dir = mkdtempSync(join(tmpdir(), "dev-loop-scope-"));
  dirs.push(dir);
  run(dir, "git", ["init", "-q"]);
  run(dir, "git", ["config", "user.email", "t@t"]);
  run(dir, "git", ["config", "user.name", "t"]);
  run(dir, "git", ["config", "core.autocrlf", "false"]);
  return { dir, base: commit(dir, base, "base") };
}

function scope(dir: string, base: string, delta = false, main?: string): Scope {
  const args = [tool, "scope", base, "HEAD", ...(delta ? ["--delta"] : []), ...(main ? ["--main", main] : [])];
  return JSON.parse(run(dir, process.execPath, args)) as Scope;
}

const land = (body: string) => `export function land(): number {\n${body}\n}\n`;
const TEST = 'it("lands", () => {\n  expect(land()).toBe(1);\n});\n';
const LEDGER = {
  "src/ledger/index.ts": 'export { land } from "./land.js";\n',
  "src/ledger/land.ts": land("  return 1;"),
  "test/ledger/land.test.ts": TEST,
  "test/structure/skeleton-files.txt": "# owned\nsrc/ledger/index.ts\n",
  "plan/phases/S0/PLAN.md": "# Plan\n",
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("dev-loop scope, first round: mode and Spec", { timeout: 30_000 }, () => {
  it("needs no review when only text outside the task changed", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "AGENTS.md": "# A\n", "discussion/notes.md": "# N\n" }, "text");
    const s = scope(dir, base);
    expect(s.mode).toBe("none");
    expect(s.axes).toEqual([]);
  });

  it("reviews Spec when the task or PLAN.md changed", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "plan/phases/S0/PLAN.md": "# Plan\n\nG-20.\n" }, "plan");
    expect(scope(dir, base).axes).toEqual(["spec"]);
  });

  it("reviews Spec and Standards for a change inside a function body", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "body");
    expect(scope(dir, base).axes).toEqual(["spec", "standards"]);
  });

  it("stops on docs/design changed without a record in discussion/decisions.md", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "docs/design/05-ledger.md": "# Ledger\n" }, "design");
    expect(scope(dir, base).stops).toHaveLength(1);
    commit(dir, { "discussion/decisions.md": "# D\n" }, "decision");
    expect(scope(dir, base).stops).toEqual([]);
  });
});

describe("dev-loop scope, first round: Architecture", { timeout: 30_000 }, () => {
  it("adds Architecture for a changed export, a new file and a skeleton file (ST-15)", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "src/ledger/index.ts": 'export { land, lift } from "./land.js";\n', "src/ledger/ports/bus.ts": "export type Bus = 1;\n" }, "port");
    const s = scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(s.triggers.skeleton).toEqual(["src/ledger/index.ts"]);
    expect(s.triggers.newPorts).toEqual(["src/ledger/ports/bus.ts"]);
  });

  it("adds Architecture for a line of pure code that looks like a bypass, not for the same line in an adapter", () => {
    const { dir } = repo(LEDGER);
    commit(dir, { "src/adapters/disk.ts": "export const now = 1;\n" }, "adapter");
    commit(dir, { "src/adapters/disk.ts": "export const now = 1;\nconst t = Date.now();\n" }, "impure");
    expect(scope(dir, "HEAD~1").reasons.architecture).toEqual([]);
    commit(dir, { "src/ledger/land.ts": land("  return JSON.stringify(1).length;") }, "pure");
    expect(scope(dir, "HEAD~1").reasons.architecture).toEqual(["добавленная строка похожа на класс каталога обходов (closure-check)"]);
  });

  it("reports a new module and three modules touched (ST-15)", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "src/trust/index.ts": "export const t = 1;\n", "src/kernel/index.ts": "export const k = 1;\n", "src/ledger/land.ts": land("  return 3;") }, "wide");
    const s = scope(dir, base);
    expect(s.triggers.newModules).toEqual(["kernel", "trust"]);
    expect(s.triggers.modules).toEqual(["kernel", "ledger", "trust"]);
  });

  it("adds Architecture for generated files and treats plan tools as code", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "store/knowledge.jsonl": "{}\n", "plan/tools/x.mjs": "export const x = 1;\n" }, "gen");
    const s = scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(s.reasons.architecture).toContain("генерируемые файлы gen/ или store/ (AG-11)");
  });
});

describe("dev-loop scope, expectations of tests (PR-11)", { timeout: 30_000 }, () => {
  it("reviews Spec when the delta changes an expectation of a test", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "test/ledger/land.test.ts": TEST.replace("toBe(1)", "toBeGreaterThan(0)") }, "weaken");
    const s = scope(dir, base, true);
    expect(s.mode).toBe("review");
    expect(s.axes).toEqual(["spec", "standards"]);
    expect(s.expectations).toEqual(["test/ledger/land.test.ts"]);
  });

  it("does not count a renamed test as a changed expectation", () => {
    const { dir, base } = repo(LEDGER);
    commit(dir, { "test/ledger/land.test.ts": null, "test/ledger/landing.test.ts": TEST }, "rename");
    expect(scope(dir, base, true).expectations).toEqual([]);
  });

  it("counts a disabled test and a removed fixture of a rule", () => {
    const { dir, base } = repo({ ...LEDGER, "test/fixtures/LG-23/trigger/a.json": "{}\n" });
    commit(dir, { "test/ledger/land.test.ts": TEST.replace("it(", "it.skip("), "test/fixtures/LG-23/trigger/a.json": null }, "off");
    expect(scope(dir, base, true).expectations).toEqual(["test/fixtures/LG-23/trigger/a.json", "test/ledger/land.test.ts"]);
  });
});

describe("dev-loop scope, later rounds", { timeout: 30_000 }, () => {
  it("checks only that findings are closed when the delta is a small change of bodies", () => {
    const { dir } = repo(LEDGER);
    const prev = commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    commit(dir, { "src/ledger/land.ts": land("  return 1 + 1;"), "plan/phases/S0/PLAN.md": "# Plan\n\nG-20.\n" }, "fix");
    const s = scope(dir, prev, true);
    expect(s.mode).toBe("verify");
    expect(s.axes).toEqual([]);
  });

  it("reviews the axes of a delta above the size of a check", () => {
    const { dir, base } = repo(LEDGER);
    const body = Array.from({ length: 45 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    commit(dir, { "src/ledger/land.ts": land(`${body}\n  return 1;`) }, "big");
    const s = scope(dir, base, true);
    expect(s.mode).toBe("review");
    expect(s.axes).toEqual(["spec", "standards"]);
  });

  it("says the delta cannot be counted when the reviewed head is no longer an ancestor", () => {
    const { dir, base } = repo(LEDGER);
    const prev = commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    run(dir, "git", ["reset", "-q", "--hard", base]);
    commit(dir, { "src/ledger/land.ts": land("  return 4;") }, "rebased");
    expect(scope(dir, prev, true).rebased).toBe(true);
  });
});

describe("dev-loop scope, stops of later rounds", { timeout: 30_000 }, () => {
  it("does not stop on docs/design when the branch recorded the decision", () => {
    const { dir, base } = repo(LEDGER);
    const prev = commit(dir, { "docs/design/05-ledger.md": "# Ledger\n", "discussion/decisions.md": "# D\n" }, "round 1");
    commit(dir, { "docs/design/05-ledger.md": "# Ledger\n\nMore.\n" }, "fix");
    expect(scope(dir, prev, true, base).stops).toEqual([]);
  });

  it("does not stop on a rewritten line of CONVENTIONS.md from main: the final report lists it for the owner", () => {
    const { dir, base } = repo({ ...LEDGER, "CONVENTIONS.md": "# C\n\n- one rule\n" });
    const prev = commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    commit(dir, { "CONVENTIONS.md": "# C\n\n- another rule\n" }, "fix");
    expect(scope(dir, prev, true, base).stops).toEqual([]);
  });
});
