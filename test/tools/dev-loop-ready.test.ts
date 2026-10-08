// dev-loop ready hands a task in (S0-51, step 6 of plan-task): the items of «Готово, когда» the executor names in
// done get [x], the task gets ✅ and the link to its PR on the board, the phase goes to 🔄 or, after its last task,
// to 🔍; plan-check runs, the change is the last commit of the branch, and the PR turns ready. An item the executor
// does not name stops the handing in with a question to the owner. GitHub is a fake gh that logs its calls;
// plan-check is the repository's own, here a stub red while PLAN_RED is set.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
let temp: Scratch;
let folders = 0;
const BRANCH = "s0-99-x";
type Json = { [key: string]: unknown };
type Files = { readonly [path: string]: string };
type Case = { root: string; work: string; dir: string };

async function sh(cwd: string, cmd: Program, args: string[], env = process.env): Promise<string> {
  const ran = await cmd.start(args, { cwd, env });
  if (ran.status !== 0 && cmd === git) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

const ITEMS = ["the tool marks `a | b`", "`npm run verify` зелёный"];
const TASK = ["---", "id: S0-99", "title: Something", "phase: S0", "---", "", "# S0-99", "", "## Готово, когда", "", ...ITEMS.map((i) => `- [ ] ${i}`), ""].join("\n");
const PHASES = (status: string, started = "—") => ["# Фазы", "", "| Фаза | Название | Статус | Начата | Выполнена | План |", "|---|---|---|---|---|---|",
  `| S0 | Kernel | ${status} | ${started} | — | [план](phases/S0-x/PLAN.md) |`, "| SW | Switch | ⬜ не начата | — | — | — |", ""].join("\n");
const BOARD = (other: string) => ["# S0", "", "| Задача | Название | Этап | Статус | PR | Заметка |", "|---|---|---|---|---|---|",
  `| [S0-98](tasks/S0-98-y.md) | Other | A | ${other} | | |`, "| [S0-99](tasks/S0-99-x.md) | Something | A | ⬜ | | note |", ""].join("\n");
const REPO: Files = {
  "plan/phases/S0-x/tasks/S0-99-x.md": TASK,
  "plan/tools/plan-check.mjs": 'console.log("plan-check");\nprocess.exit(process.env.PLAN_RED ? 1 : 0);\n',
  "gh.mjs": [
    'import { appendFileSync } from "node:fs";',
    "const args = process.argv.slice(2);",
    'appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + "\\n");',
    'if (args[1] === "view") console.log(JSON.stringify({ url: `https://example.test/pull/${args[2]}` }));',
  ].join("\n"),
};

function put(work: string, files: Files): void {
  for (const [path, text] of Object.entries(files)) temp.write(join(work, path), text);
}

// A checkout on the branch of S0-99 pushed to its origin; the board and the phase are set per case.
async function build(): Promise<string> {
  const root = folder("base-");
  const work = join(root, "work");
  put(work, REPO);
  await sh(root, git, ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, git, args);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "base"]);
  await sh(work, git, ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  return root;
}

let built: Promise<string> | undefined;

async function repo(phase: string, other: string, started = "—"): Promise<Case> {
  built ??= build();
  const root = folder("case-");
  temp.copy(await built, root);
  const work = join(root, "work");
  await sh(work, git, ["remote", "set-url", "origin", join(root, "origin.git")]);
  put(work, { "plan/STATUS.md": PHASES(phase, started), "plan/phases/S0-x/STATUS.md": BOARD(other) });
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "S0-99: the work"]);
  await sh(work, git, ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return { root, work, dir: join(root, "loop") };
}

const head = (c: Case) => sh(c.work, git, ["rev-parse", "HEAD"]);

// The executor's output with these items done, beside its brief.
async function executorOut(c: Case, done: readonly string[] | undefined): Promise<string> {
  temp.mkdir(c.dir);
  temp.write(join(c.dir, "executor.in.json"), JSON.stringify({ role: "executor", task: "S0-99", pr: 9, branch: BRANCH, worktree: c.work, out: join(c.dir, "executor.out.json") }));
  temp.write(join(c.dir, "executor.out.json"), JSON.stringify({ status: "ready", pr: 9, branch: BRANCH, head: await head(c), done }));
  return join(c.dir, "executor.out.json");
}

async function dl(c: Case, args: string[], env: NodeJS.ProcessEnv = {}): Promise<Json> {
  const all = { ...process.env, DEV_LOOP_GH: join(c.root, "work", "gh.mjs"), FAKE_GH_LOG: join(c.root, "gh.log"), DEV_LOOP_NOW: "2026-10-08T10:00:00.000Z", ...env };
  return JSON.parse(await sh(c.work, tool, [...args], all)) as Json;
}

const ghCalls = (c: Case): string[][] => {
  try {
    return temp.text(join(c.root, "gh.log")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
  } catch {
    return [];
  }
};
const file = (c: Case, path: string) => temp.text(join(c.work, path));
const ready = async (c: Case, done: readonly string[] | undefined, env: NodeJS.ProcessEnv = {}) =>
  dl(c, ["ready", "--worktree", c.work, "--from", await executorOut(c, done), "--dir", c.dir], env);

beforeAll(() => {
  temp = scratch("dev-loop-ready-");
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop ready, a task handed in", { timeout: 30_000 }, () => {
  it("marks the items, closes the task on the board, starts the phase, pushes the last commit and turns the PR ready", async () => {
    const c = await repo("📝 план", "⬜");
    expect(await ready(c, ITEMS)).toMatchObject({ ok: true, next: "gate", head: await head(c) });
    expect(file(c, "plan/phases/S0-x/tasks/S0-99-x.md")).toBe(TASK.replaceAll("- [ ]", "- [x]"));
    expect(file(c, "plan/phases/S0-x/STATUS.md")).toContain("| [S0-99](tasks/S0-99-x.md) | Something | A | ✅ | [#9](https://example.test/pull/9) | note |\n");
    expect(file(c, "plan/STATUS.md")).toContain("| S0 | Kernel | 🔄 в работе | 2026-10-08 | — | [план](phases/S0-x/PLAN.md) |\n| SW | Switch | ⬜ не начата | — | — | — |\n");
    expect(await sh(c.work, git, ["status", "--porcelain"])).toBe("");
    expect(await sh(c.work, git, ["log", "-1", "--format=%s"])).toMatch(/^S0-99: /);
    expect((await sh(c.work, git, ["ls-remote", "origin", `refs/heads/${BRANCH}`])).split("\t")[0]).toBe(await head(c));
    expect(ghCalls(c)).toContainEqual(["pr", "ready", "9"]);
  });

  // Two cases of the phase, each with its two repositories: one case of four ran at the edge of the safeguard of time.
  it("sends the phase to acceptance after its last task; its start date stays, a missing one is today", async () => {
    const last = await repo("🔄 в работе", "✅");
    expect(await ready(last, ITEMS)).toMatchObject({ ok: true, next: "gate" });
    expect(file(last, "plan/STATUS.md")).toContain("| S0 | Kernel | 🔍 приёмка | 2026-10-08 |");
    const lastDated = await repo("🔄 в работе", "✅", "2026-09-01");
    expect(await ready(lastDated, ITEMS)).toMatchObject({ ok: true, next: "gate" });
    expect(file(lastDated, "plan/STATUS.md")).toBe(PHASES("🔍 приёмка", "2026-09-01"));
  });

  it("keeps a phase in work otherwise; its start date stays, a missing one is today", async () => {
    const undated = await repo("🔄 в работе", "⬜");
    expect(await ready(undated, ITEMS)).toMatchObject({ ok: true });
    expect(file(undated, "plan/STATUS.md")).toBe(PHASES("🔄 в работе", "2026-10-08"));
    const middle = await repo("🔄 в работе", "⬜", "2026-09-01");
    expect(await ready(middle, ITEMS)).toMatchObject({ ok: true });
    expect(file(middle, "plan/STATUS.md")).toBe(PHASES("🔄 в работе", "2026-09-01"));
  });
});

describe.concurrent("dev-loop ready, a task not handed in", { timeout: 30_000 }, () => {
  it("asks the owner about an item the executor did not name and changes nothing", async () => {
    const c = await repo("🔄 в работе", "⬜");
    const before = await head(c);
    const r = await ready(c, [ITEMS[1]!]);
    expect(r).toMatchObject({ ok: true, next: "escalate", missing: [ITEMS[0]] });
    expect(r.why).toContain("Отступления");
    expect(await head(c)).toBe(before);
    expect(await sh(c.work, git, ["status", "--porcelain"])).toBe("");
    expect(ghCalls(c)).toEqual([]);
  });

  it("writes nothing while plan-check is red", async () => {
    const c = await repo("🔄 в работе", "⬜");
    const before = await head(c);
    expect(await ready(c, ITEMS, { PLAN_RED: "1" })).toMatchObject({ ok: false, error: "plan-check красный — сдача не записана" });
    expect(await head(c)).toBe(before);
    expect(await sh(c.work, git, ["status", "--porcelain"])).toBe("");
    expect(ghCalls(c).filter((a) => a[1] === "ready")).toEqual([]);
  });
});

describe.concurrent("dev-loop check, the items an executor names done", { timeout: 30_000 }, () => {
  it("accepts the items of the task file and refuses an output without them or with an item the file lacks", async () => {
    const c = await repo("🔄 в работе", "⬜");
    const check = async (done: readonly string[] | undefined) => (await dl(c, ["check", await executorOut(c, done)])).errors;
    expect(await check(ITEMS)).toEqual([]);
    expect(await check(undefined)).toEqual(["done: нет — нужен список выполненных пунктов «Готово, когда», словами файла задачи"]);
    expect(await check(["something else"])).toEqual(["done[0]: «something else» — нет такого пункта «Готово, когда» в файле задачи"]);
  });
});
