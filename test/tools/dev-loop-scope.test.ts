// dev-loop scope decides the mode and the axes of a review round (plan/dev-loop.md);
// these cases build a throwaway repository and show each branch of the decision.
// The repository of a base is built once and copied for each case; the cases run concurrently (S0-40).
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
let temp: Scratch;
let folders = 0;

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
type Repo = { dir: string; base: string };

async function run(dir: string, cmd: Program, args: string[]): Promise<string> {
  const ran = await cmd.start(args, { cwd: dir });
  if (ran.status !== 0) throw new Error(`${cmd === git ? "git" : "dl"} ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

async function commit(dir: string, files: Files, message: string): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const file = join(dir, path);
    if (text === null) temp.remove(file);
    else temp.write(file, text);
  }
  await run(dir, git, ["add", "-A"]);
  await run(dir, git, ["commit", "-q", "-m", message]);
}

// Commits the files and names the commit; only the commits a case names ask git for their hash.
async function named(dir: string, files: Files, message: string): Promise<string> {
  await commit(dir, files, message);
  return run(dir, git, ["rev-parse", "HEAD"]);
}

async function build(base: Files): Promise<Repo> {
  const dir = folder("base-");
  // --template= leaves out the sample hooks: a repository without them copies several times faster.
  await run(dir, git, ["init", "-q", "--template="]);
  await run(dir, git, ["config", "user.email", "t@t"]);
  await run(dir, git, ["config", "user.name", "t"]);
  await run(dir, git, ["config", "core.autocrlf", "false"]);
  return { dir, base: await named(dir, base, "base") };
}

// The built repository of each base, by the base.
const built = new Map<Files, Promise<Repo>>();

async function repo(base: Files): Promise<Repo> {
  let source = built.get(base);
  if (source === undefined) {
    source = build(base);
    built.set(base, source);
  }
  const { dir: from, base: head } = await source;
  const dir = folder("case-");
  temp.copy(from, dir);
  return { dir, base: head };
}

function scope(dir: string, base: string, delta = false, main?: string): Promise<Scope> {
  const args = ["scope", base, "HEAD", ...(delta ? ["--delta"] : []), ...(main ? ["--main", main] : [])];
  return run(dir, tool, args).then((out) => JSON.parse(out) as Scope);
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

beforeAll(() => {
  temp = scratch("dev-loop-scope-");
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop scope, first round: mode and Spec", { timeout: 30_000 }, () => {
  it("needs no review when only text outside the task changed", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "AGENTS.md": "# A\n", "discussion/notes.md": "# N\n" }, "text");
    const s = await scope(dir, base);
    expect(s.mode).toBe("none");
    expect(s.axes).toEqual([]);
  });

  it("reviews Spec when the task or PLAN.md changed", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "plan/phases/S0/PLAN.md": "# Plan\n\nG-20.\n" }, "plan");
    expect((await scope(dir, base)).axes).toEqual(["spec"]);
  });

  it("reviews Spec and Standards for a change inside a function body", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "body");
    expect((await scope(dir, base)).axes).toEqual(["spec", "standards"]);
  });

  it("stops on docs/design changed without a record in discussion/decisions.md", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "docs/design/05-ledger.md": "# Ledger\n" }, "design");
    expect((await scope(dir, base)).stops).toHaveLength(1);
    await commit(dir, { "discussion/decisions.md": "# D\n" }, "decision");
    expect((await scope(dir, base)).stops).toEqual([]);
  });
});

describe.concurrent("dev-loop scope, first round: Architecture", { timeout: 30_000 }, () => {
  it("adds Architecture for a changed export, a new file and a skeleton file (ST-15)", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/ledger/index.ts": 'export { land, lift } from "./land.js";\n', "src/ledger/ports/bus.ts": "export type Bus = 1;\n" }, "port");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(s.triggers.skeleton).toEqual(["src/ledger/index.ts"]);
    expect(s.triggers.newPorts).toEqual(["src/ledger/ports/bus.ts"]);
  });

  it("adds Architecture for a line of pure code that looks like a bypass, not for the same line in an adapter", async () => {
    const { dir } = await repo(LEDGER);
    await commit(dir, { "src/adapters/disk.ts": "export const now = 1;\n" }, "adapter");
    await commit(dir, { "src/adapters/disk.ts": "export const now = 1;\nconst t = Date.now();\n" }, "impure");
    expect((await scope(dir, "HEAD~1")).reasons.architecture).toEqual([]);
    await commit(dir, { "src/ledger/land.ts": land("  return JSON.stringify(1).length;") }, "pure");
    expect((await scope(dir, "HEAD~1")).reasons.architecture).toEqual(["добавленная строка похожа на класс каталога обходов (closure-check)"]);
  });

  it("reports a new module and three modules touched (ST-15)", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/trust/index.ts": "export const t = 1;\n", "src/kernel/index.ts": "export const k = 1;\n", "src/ledger/land.ts": land("  return 3;") }, "wide");
    const s = await scope(dir, base);
    expect(s.triggers.newModules).toEqual(["kernel", "trust"]);
    expect(s.triggers.modules).toEqual(["kernel", "ledger", "trust"]);
  });

  it("adds Architecture for generated files and treats plan tools as code", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "store/knowledge.jsonl": "{}\n", "plan/tools/x.mjs": "export const x = 1;\n" }, "gen");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(s.reasons.architecture).toContain("генерируемые файлы gen/ или store/ (AG-11)");
  });
});

describe.concurrent("dev-loop scope, expectations of tests (PR-11)", { timeout: 30_000 }, () => {
  it("reviews Spec when the delta changes an expectation of a test", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "test/ledger/land.test.ts": TEST.replace("toBe(1)", "toBeGreaterThan(0)") }, "weaken");
    const s = await scope(dir, base, true);
    expect(s.mode).toBe("review");
    expect(s.axes).toEqual(["spec", "standards"]);
    expect(s.expectations).toEqual(["test/ledger/land.test.ts"]);
  });

  it("does not count a renamed test as a changed expectation", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "test/ledger/land.test.ts": null, "test/ledger/landing.test.ts": TEST }, "rename");
    expect((await scope(dir, base, true)).expectations).toEqual([]);
  });

  it("counts a disabled test and a removed fixture of a rule", async () => {
    const { dir, base } = await repo({ ...LEDGER, "test/fixtures/LG-23/trigger/a.json": "{}\n" });
    await commit(dir, { "test/ledger/land.test.ts": TEST.replace("it(", "it.skip("), "test/fixtures/LG-23/trigger/a.json": null }, "off");
    expect((await scope(dir, base, true)).expectations).toEqual(["test/fixtures/LG-23/trigger/a.json", "test/ledger/land.test.ts"]);
  });
});

describe.concurrent("dev-loop scope, later rounds", { timeout: 30_000 }, () => {
  it("checks only that findings are closed when the delta is a small change of bodies", async () => {
    const { dir } = await repo(LEDGER);
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    await commit(dir, { "src/ledger/land.ts": land("  return 1 + 1;"), "plan/phases/S0/PLAN.md": "# Plan\n\nG-20.\n" }, "fix");
    const s = await scope(dir, prev, true);
    expect(s.mode).toBe("verify");
    expect(s.axes).toEqual([]);
  });

  it("reviews the axes of a delta above the size of a check", async () => {
    const { dir, base } = await repo(LEDGER);
    const body = Array.from({ length: 45 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    await commit(dir, { "src/ledger/land.ts": land(`${body}\n  return 1;`) }, "big");
    const s = await scope(dir, base, true);
    expect(s.mode).toBe("review");
    expect(s.axes).toEqual(["spec", "standards"]);
  });

  it("says the delta cannot be counted when the reviewed head is no longer an ancestor", async () => {
    const { dir, base } = await repo(LEDGER);
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    await run(dir, git, ["reset", "-q", "--hard", base]);
    await commit(dir, { "src/ledger/land.ts": land("  return 4;") }, "rebased");
    expect((await scope(dir, prev, true)).rebased).toBe(true);
  });
});

describe.concurrent("dev-loop scope, stops of later rounds", { timeout: 30_000 }, () => {
  it("does not stop on docs/design when the branch recorded the decision", async () => {
    const { dir, base } = await repo(LEDGER);
    const prev = await named(dir, { "docs/design/05-ledger.md": "# Ledger\n", "discussion/decisions.md": "# D\n" }, "round 1");
    await commit(dir, { "docs/design/05-ledger.md": "# Ledger\n\nMore.\n" }, "fix");
    expect((await scope(dir, prev, true, base)).stops).toEqual([]);
  });

  it("does not stop on a rewritten line of CONVENTIONS.md from main: the final report lists it for the owner", async () => {
    const { dir, base } = await repo({ ...LEDGER, "CONVENTIONS.md": "# C\n\n- one rule\n" });
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    await commit(dir, { "CONVENTIONS.md": "# C\n\n- another rule\n" }, "fix");
    expect((await scope(dir, prev, true, base)).stops).toEqual([]);
  });
});
