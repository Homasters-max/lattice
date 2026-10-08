// dev-loop scope splits the diff of the branch into hunks and names for each the axes whose triggers it touches
// (plan/dev-loop.md, «Круги»): the verdict of an axis is evidence keyed by the hunk, so an edit that touches a hunk
// gives it a new id and an edit elsewhere keeps it (S0-45). These cases build a throwaway repository and show each
// trigger, the id of a hunk and what the scope says to the owner.
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
type Hunk = { id: string; file: string; at: string; text: string; axes: { [axis: string]: string[] } };
type Scope = {
  hunks: Hunk[];
  axes: string[];
  reasons: { [axis: string]: string[] };
  stops: string[];
  triggers: { skeleton: string[]; newModules: string[]; newPorts: string[]; modules: string[] };
  expectations: string[];
  bypass: string[];
  delta: { file: string; at: string; text: string }[];
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

function scope(dir: string, base: string, since?: string): Promise<Scope> {
  const args = ["scope", base, "HEAD", ...(since ? ["--since", since] : [])];
  return run(dir, tool, args).then((out) => JSON.parse(out) as Scope);
}

/** The hunks of a file in the scope. */
const of = (s: Scope, file: string) => s.hunks.filter((h) => h.file === file);

const land = (body: string) => `export function land(): number {\n${body}\n}\n`;
const TEST = 'it("lands", () => {\n  expect(land()).toBe(1);\n});\n';
const LEDGER = {
  "src/ledger/index.ts": 'export { land } from "./land.js";\n',
  "src/ledger/land.ts": land("  return 1;"),
  "test/ledger/land.test.ts": TEST,
  "test/structure/skeleton-files.txt": "# owned\nsrc/ledger/index.ts\n",
  "plan/phases/S0/PLAN.md": "# Plan\n",
};
// A body of twenty lines: an edit at the top and one at the bottom are two hunks far apart.
const LONG = Array.from({ length: 20 }, (_, i) => `  const v${i} = ${i};`);
const long = (rows: string[]) => land(`${rows.join("\n")}\n  return 1;`);
const LONG_LEDGER = { ...LEDGER, "src/ledger/land.ts": long(LONG) };

beforeAll(() => {
  temp = scratch("dev-loop-scope-");
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop scope, the axes of a hunk: Spec and Standards", { timeout: 30_000 }, () => {
  it("needs no review when only text outside the task changed", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "AGENTS.md": "# A\n", "discussion/notes.md": "# N\n" }, "text");
    const s = await scope(dir, base);
    expect(s.hunks.map((h) => h.file)).toEqual(["AGENTS.md", "discussion/notes.md"]);
    expect(s.hunks.map((h) => h.axes)).toEqual([{}, {}]);
    expect(s.axes).toEqual([]);
  });

  it("reviews with Spec the task or PLAN.md and the text of a branch that changes them", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "plan/phases/S0/PLAN.md": "# Plan\n\nG-20.\n", "AGENTS.md": "# A\n" }, "plan");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec"]);
    expect(of(s, "plan/phases/S0/PLAN.md")[0]!.axes).toEqual({ spec: ["изменены файл задачи или PLAN.md"] });
    expect(of(s, "AGENTS.md")[0]!.axes).toEqual({ spec: ["текст ветки, где изменены код, тесты или задача"] });
  });

  it("reviews with Spec and Standards a change inside a function body", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/ledger/land.ts": land("  return 2;") }, "body");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards"]);
    expect(s.hunks.map(({ id: _, ...h }) => h)).toEqual([{ file: "src/ledger/land.ts", at: "2", text: "@@ -2 +2 @@ export function land(): number {\n-  return 1;\n+  return 2;", axes: { spec: ["изменён код"], standards: ["изменён код"] } }]);
    expect(s.hunks[0]!.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("stops on docs/design changed without a record in discussion/decisions.md", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "docs/design/05-ledger.md": "# Ledger\n" }, "design");
    expect((await scope(dir, base)).stops).toHaveLength(1);
    await commit(dir, { "discussion/decisions.md": "# D\n" }, "decision");
    expect((await scope(dir, base)).stops).toEqual([]);
  });
});

describe.concurrent("dev-loop scope, the axes of a hunk: Architecture by its triggers", { timeout: 30_000 }, () => {
  it("calls Architecture for a changed export, a new port and a skeleton file (ST-15)", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/ledger/index.ts": 'export { land, lift } from "./land.js";\n', "src/ledger/ports/bus.ts": "export type Bus = 1;\n" }, "port");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(of(s, "src/ledger/index.ts")[0]!.axes.architecture).toEqual(["новый или изменённый экспорт (опись closure-check)", "файл walking skeleton (ST-15)"]);
    expect(of(s, "src/ledger/ports/bus.ts")[0]!.axes.architecture).toEqual(["новый или изменённый экспорт (опись closure-check)", "новый порт (ST-15)"]);
    expect(s.triggers.skeleton).toEqual(["src/ledger/index.ts"]);
    expect(s.triggers.newPorts).toEqual(["src/ledger/ports/bus.ts"]);
  });

  it("does not call Architecture for a delta without its triggers, and calls it for a new export", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "src/ledger/land.ts": land("  return 2;"), "test/ledger/land.test.ts": TEST.replace("lands", "lands one") }, "body");
    expect((await scope(dir, base)).axes).toEqual(["spec", "standards"]);
    await commit(dir, { "src/ledger/land.ts": `${land("  return 2;")}export const LAND = 2;\n` }, "export");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards", "architecture"]);
    expect(s.hunks.filter((h) => h.axes.architecture).map((h) => [h.file, h.at])).toEqual([["src/ledger/land.ts", "4"]]);
  });

  it("calls Architecture for test helpers and every hunk of a new module (ST-15)", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "test/support/clock.ts": "const t = 1;\n", "src/trust/rank.ts": "const r = 1;\n", "src/kernel/index.ts": "const k = 1;\n", "src/ledger/land.ts": land("  return 3;") }, "wide");
    const s = await scope(dir, base);
    expect(of(s, "test/support/clock.ts")[0]!.axes.architecture).toEqual(["тест-хелперы test/support/"]);
    expect(of(s, "src/trust/rank.ts")[0]!.axes.architecture).toEqual(["новый модуль trust (ST-15)"]);
    expect(of(s, "src/ledger/land.ts")[0]!.axes.architecture).toBeUndefined();
    expect(s.triggers.newModules).toEqual(["kernel", "trust"]);
    expect(s.triggers.modules).toEqual(["kernel", "ledger", "trust"]);
  });

  it("does not call Architecture for a line of pure code that looks like a bypass: the self-check lists it, not the same line in an adapter", async () => {
    const { dir } = await repo(LEDGER);
    await commit(dir, { "src/adapters/disk.ts": "export const now = 1;\n" }, "adapter");
    await commit(dir, { "src/adapters/disk.ts": "export const now = 1;\nconst t = Date.now();\n" }, "impure");
    expect(await scope(dir, "HEAD~1")).toMatchObject({ reasons: { architecture: [] }, bypass: [] });
    await commit(dir, { "src/ledger/land.ts": land("  return JSON.stringify(1).length;") }, "pure");
    expect(await scope(dir, "HEAD~1")).toMatchObject({ reasons: { architecture: [] }, bypass: ["src/ledger/land.ts:2"] });
  });

  it("does not call Architecture for generated files or an export of plan tools, and leaves the generated files out of Spec", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "store/knowledge.jsonl": "{}\n", "plan/tools/x.mjs": "export const x = 1;\n" }, "gen");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards"]);
    expect(of(s, "store/knowledge.jsonl")[0]!.axes).toEqual({});
  });
});

describe.concurrent("dev-loop scope, expectations of tests (PR-11)", { timeout: 30_000 }, () => {
  it("reviews with Spec a hunk that changes an expectation of a test", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "test/ledger/land.test.ts": TEST.replace("toBe(1)", "toBeGreaterThan(0)") }, "weaken");
    const s = await scope(dir, base);
    expect(s.axes).toEqual(["spec", "standards"]);
    expect(of(s, "test/ledger/land.test.ts")[0]!.axes.spec).toEqual(["изменены тесты", "изменено или отключено ожидание теста (PR-11)"]);
    expect(s.expectations).toEqual(["test/ledger/land.test.ts"]);
  });

  it("does not count a renamed test as a changed expectation: the rename is one hunk of its status", async () => {
    const { dir, base } = await repo(LEDGER);
    await commit(dir, { "test/ledger/land.test.ts": null, "test/ledger/landing.test.ts": TEST }, "rename");
    const s = await scope(dir, base);
    expect(s.expectations).toEqual([]);
    expect(s.hunks.map((h) => [h.file, h.at, h.text])).toEqual([["test/ledger/landing.test.ts", "файл", "R test/ledger/land.test.ts → test/ledger/landing.test.ts"]]);
  });

  it("counts a disabled test and a removed fixture of a rule", async () => {
    const { dir, base } = await repo({ ...LEDGER, "test/fixtures/LG-23/trigger/a.json": "{}\n" });
    await commit(dir, { "test/ledger/land.test.ts": TEST.replace("it(", "it.skip("), "test/fixtures/LG-23/trigger/a.json": null }, "off");
    expect((await scope(dir, base)).expectations).toEqual(["test/fixtures/LG-23/trigger/a.json", "test/ledger/land.test.ts"]);
  });
});

describe.concurrent("dev-loop scope, the id of a hunk", { timeout: 30_000 }, () => {
  it("keeps the id of a hunk an edit elsewhere moves, and gives the edited hunk a new one", async () => {
    const { dir, base } = await repo(LONG_LEDGER);
    const first = LONG.map((r, i) => (i === 1 || i === 18 ? r.replace("= ", "= 1 + ") : r));
    await commit(dir, { "src/ledger/land.ts": long(first) }, "round 1");
    const [top, bottom] = of(await scope(dir, base), "src/ledger/land.ts");
    await commit(dir, { "src/ledger/land.ts": long([...first.slice(0, 2), "  const w = 0;", "  const x = 0;", ...first.slice(2)]) }, "fix");
    const after = of(await scope(dir, base), "src/ledger/land.ts");
    expect(after.map((h) => h.at)).toEqual(["3-5", "22"]);
    expect(after[0]!.id).not.toBe(top!.id);
    expect(after[1]!.id).toBe(bottom!.id);
    expect(bottom!.at).toBe("20");
  });

  it("gives two hunks of the same lines in one file two ids", async () => {
    const { dir, base } = await repo(LONG_LEDGER);
    await commit(dir, { "src/ledger/land.ts": long(LONG.flatMap((r, i) => (i === 1 || i === 18 ? [r, "  // x"] : [r]))) }, "twins");
    const hunks = of(await scope(dir, base), "src/ledger/land.ts");
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.id).not.toBe(hunks[1]!.id);
  });
});

describe.concurrent("dev-loop scope, since the reviewed head", { timeout: 30_000 }, () => {
  it("gives the hunks of the delta since the reviewed head", async () => {
    const { dir, base } = await repo(LEDGER);
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;"), "test/ledger/land.test.ts": TEST.replace("lands", "lands two") }, "round 1");
    await commit(dir, { "src/ledger/land.ts": land("  return 3;") }, "fix");
    const s = await scope(dir, base, prev);
    expect(s.hunks.map((h) => h.file)).toEqual(["src/ledger/land.ts", "test/ledger/land.test.ts"]);
    expect(s.delta).toEqual([{ file: "src/ledger/land.ts", at: "2", text: "@@ -2 +2 @@ export function land(): number {\n-  return 2;\n+  return 3;" }]);
    expect(s.rebased).toBe(false);
  });

  it("says the delta cannot be counted when the reviewed head is no longer an ancestor", async () => {
    const { dir, base } = await repo(LEDGER);
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    await run(dir, git, ["reset", "-q", "--hard", base]);
    await commit(dir, { "src/ledger/land.ts": land("  return 4;") }, "rebased");
    expect(await scope(dir, base, prev)).toMatchObject({ rebased: true, delta: [] });
  });

  it("does not stop on docs/design when the branch recorded the decision before the reviewed head", async () => {
    const { dir, base } = await repo(LEDGER);
    const prev = await named(dir, { "docs/design/05-ledger.md": "# Ledger\n", "discussion/decisions.md": "# D\n" }, "round 1");
    await commit(dir, { "docs/design/05-ledger.md": "# Ledger\n\nMore.\n" }, "fix");
    expect((await scope(dir, base, prev)).stops).toEqual([]);
  });

  it("does not stop on a rewritten line of CONVENTIONS.md from main: the final report lists it for the owner", async () => {
    const { dir, base } = await repo({ ...LEDGER, "CONVENTIONS.md": "# C\n\n- one rule\n" });
    const prev = await named(dir, { "src/ledger/land.ts": land("  return 2;") }, "round 1");
    await commit(dir, { "CONVENTIONS.md": "# C\n\n- another rule\n" }, "fix");
    expect((await scope(dir, base, prev)).stops).toEqual([]);
  });
});
