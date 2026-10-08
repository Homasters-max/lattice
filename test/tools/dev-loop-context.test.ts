// dev-loop gives each agent the context its role needs and nothing more (S0-48): the brief carries the data of the
// task — rule texts word for word from docs/design, the items of CONVENTIONS.md whose area touches what the agent
// works on, the hunks of its axis — within a budget of tokens, and names what it cut; `dl step` hands out the material
// of one step: the self-check over the diff of the branch and the sections of plan-task as written. What an agent had to
// read beyond its brief comes back in context_missing, and the final report prints it.
// Each case runs the tool on a throwaway repository with an origin; GitHub is a fake gh.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const tool = join(root, "plan/tools/dev-loop.mjs");
const BUDGET = 15000;
const BRANCH = "s0-99-x";
let temp = "";
let gh = "";
type Json = { [key: string]: unknown };
type Files = { readonly [path: string]: string };
type Loop = { work: string; dir: string };
type Brief = Json & { context: { [part: string]: unknown }; cut: string[]; tokens: number };

function sh(cwd: string, cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, DEV_LOOP_GH: gh }, maxBuffer: 1 << 26 }, (error, stdout, stderr) => {
      if (error && cmd === "git") reject(new Error(`git ${args.join(" ")}: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
}

async function put(work: string, files: Files): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(work, path)), { recursive: true });
    await writeFile(join(work, path), text);
  }
}

const ST01 = "| ST-01 | Modules and what each may import: |";
const ST01_TABLE = "| Module | May import |\n|---|---|\n| `kernel` | — |";
const ST = (id: string) => `| ${id} | The rule ${id}. |`;
const DESIGN: Files = {
  "docs/design/05-ledger.md": "# Ledger\n\n| ID | Rule |\n|---|---|\n| LG-23 | Landing pushes through the git port. |\n| LG-24 | Another rule. |\n",
  "docs/design/13-structure.md": ["# Structure", "", "| ID | Rule |", "|---|---|", ST01, "", ST01_TABLE, "", "| ID | Rule |", "|---|---|",
    ...["ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08", "ST-09", "ST-11", "ST-12", "ST-13", "ST-17", "ST-18"].map(ST), ""].join("\n"),
  "docs/design/README.md": "# Design\n\nRM-Z04. The mechanisms of LATTICE:\n\n| Mechanism | Rules |\n|---|---|\n| landing | LG-22 |\n\n| ID | Rule |\n|---|---|\n| RM-08 | A mechanism not in RM-Z04 does not exist. |\n",
};
const ITEM = (id: string, area: string) => `### ${id} Item ${id}\nОбласть: \`${area}\`\n\nText of ${id}.\n`;
const CONVENTIONS = ["# C", "", "## 1. A", "", ITEM("§1.1", "src/**"), ITEM("§1.2", "src/kernel/**"), ITEM("§1.3", "test/**"), ITEM("§1.4", "src/ledger/ports/**"), ITEM("§1.5", "test/fixtures/**")].join("\n");
const TASK = ["---", "id: S0-99", "title: X", "phase: S0", "modules: [ledger]", "rules: [LG-23, ST-01]", "---", "", "# S0-99", "",
  "Answers Q-05; recommendation of G-03.", "", "## Готово, когда", "", "- [ ] land works", ""].join("\n");
const PLAN = "# S0\n\n| ID | Вопрос |\n|---|---|\n| Q-05 | What does phase 7 do? |\n| Q-06 | Unrelated. |\n\n| ID | Пробел |\n|---|---|\n| G-03 | order of records |\n";
const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;
const MAIN: Files = {
  ...DESIGN,
  "CONVENTIONS.md": CONVENTIONS,
  "plan/phases/S0-x/tasks/S0-99-x.md": TASK,
  "plan/phases/S0-x/PLAN.md": PLAN,
  "plan/phases/S0-x/STATUS.md": "# S0\n",
  "plan/closure-check.md": "# Closure\n\n## Шаги\n\n1. Inventory.\n\n## Каталог обходов\n\n| Класс |\n|---|\n| order |\n\n## Ratchet\n\nLater.\n",
  "src/ledger/land.ts": land(1),
  "test/fixtures/LG-23/trigger/a.json": "{}\n",
  "test/fixtures/LG-23/pass/a.json": "{}\n",
};

// A work tree whose origin's main holds MAIN, the branch with the change committed and pushed, and an initialised loop.
async function loop(change: Files): Promise<Loop> {
  const base = await mkdtemp(join(temp, "case-"));
  const work = join(base, "work");
  await put(work, MAIN);
  await sh(base, "git", ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(base, "origin.git")]]) await sh(work, "git", args);
  await sh(work, "git", ["add", "-A"]);
  await sh(work, "git", ["commit", "-q", "-m", "base"]);
  await sh(work, "git", ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await put(work, change);
  await sh(work, "git", ["add", "-A"]);
  await sh(work, "git", ["commit", "-q", "-m", "task"]);
  await sh(work, "git", ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  const l = { work, dir: join(base, "loop") };
  await dl(l, "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
  return l;
}

async function dl(l: Loop, ...args: string[]): Promise<Json> {
  return JSON.parse(await sh(l.work, process.execPath, [tool, ...args, ...(["check", "step"].includes(args[0]!) ? [] : ["--dir", l.dir])])) as Json;
}

const read = (file: string): Brief => JSON.parse(readFileSync(file, "utf8")) as Brief;
const ids = (list: unknown) => (list as { id: string }[]).map((x) => x.id);

async function wave(l: Loop): Promise<{ [agent: string]: string }> {
  const w = await dl(l, "wave", "--worktree", l.work);
  return Object.fromEntries((w.agents as { agent: string; brief: string }[]).map((a) => [a.agent, a.brief]));
}

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), "dev-loop-context-"));
  gh = join(temp, "gh.mjs");
  writeFileSync(gh, 'const a = process.argv.slice(2);\nif (a[0] === "pr" && a[1] === "view") console.log(JSON.stringify({ body: "## S0-99 · X\\n\\nThe body of PR " + a[2] }));\n');
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe.concurrent("dev-loop brief of the executor", { timeout: 30_000 }, () => {
  it("carries the task, its rules word for word, its Q-NN and G-NN rows and only the items of CONVENTIONS.md that touch its modules", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const b = read((await dl(l, "brief", "executor", "--task", "S0-99", "--worktree", l.work)).brief as string);
    expect(b.context.task).toEqual({ path: "plan/phases/S0-x/tasks/S0-99-x.md", text: TASK });
    expect(b.context.rules).toEqual([
      { id: "LG-23", text: "| LG-23 | Landing pushes through the git port. |" },
      { id: "ST-01", text: `${ST01}\n${ST01_TABLE}` },
    ]);
    expect(b.context.questions).toEqual([
      { id: "Q-05", text: "| Q-05 | What does phase 7 do? |" },
      { id: "G-03", text: "| G-03 | order of records |" },
    ]);
    expect(ids(b.context.conventions)).toEqual(["§1.1", "§1.3", "§1.4"]);
    expect((b.context.conventions as { text: string }[])[0]!.text).toBe("### §1.1 Item §1.1\nОбласть: `src/**`\n\nText of §1.1.");
    expect(b.cut).toEqual([]);
    expect(b.tokens).toBeLessThanOrEqual(BUDGET);
    expect(b).toMatchObject({ role: "executor", task: "S0-99", pr: 9, branch: BRANCH });
  });
});

describe.concurrent("dev-loop briefs of the reviewers", { timeout: 30_000 }, () => {
  it("gives Standards only the ST rows of the classes of its hunks and the items of CONVENTIONS.md over their paths", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const b = read((await wave(l))["reviewer-standards"]!);
    expect(ids(b.context.st)).toEqual(["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-11", "ST-17"]);
    expect((b.context.st as { text: string }[])[0]!.text).toBe(`${ST01}\n${ST01_TABLE}`);
    expect(ids(b.context.conventions)).toEqual(["§1.1"]);
    expect((b.context.hunks as { file: string }[]).map((h) => h.file)).toEqual(["src/ledger/land.ts"]);
    expect(readFileSync(b.diff as string, "utf8")).toContain("+  return 2;");
  });

  it("gives Spec the task, its rules and the body of the PR, and Architecture the closure check and RM-Z04", async () => {
    const l = await loop({ "src/ledger/land.ts": `${land(2)}export const LAND = 2;\n` });
    const briefs = await wave(l);
    const spec = read(briefs["reviewer-spec"]!);
    expect(spec.context).toMatchObject({ task: { text: TASK }, pr_body: "## S0-99 · X\n\nThe body of PR 9" });
    expect(ids(spec.context.rules)).toEqual(["LG-23", "ST-01"]);
    const arch = read(briefs["reviewer-architecture"]!);
    expect(arch.context.closure).toBe(MAIN["plan/closure-check.md"]);
    expect(arch.context.rm).toEqual([
      { id: "RM-Z04", text: "RM-Z04. The mechanisms of LATTICE:\n| Mechanism | Rules |\n|---|---|\n| landing | LG-22 |" },
      { id: "RM-08", text: "| RM-08 | A mechanism not in RM-Z04 does not exist. |" },
    ]);
  });

  it("cuts a brief over the budget and names what it cut and where it is", async () => {
    const big = Array.from({ length: 4000 }, (_, i) => `export const value${i} = "${"x".repeat(12)}";`).join("\n") + "\n";
    const l = await loop({ "src/ledger/big.ts": big, "src/ledger/land.ts": land(2) });
    const file = (await wave(l))["reviewer-standards"]!;
    const b = read(file);
    expect(b.cut).toEqual([expect.stringMatching(/^hunks: src\/ledger\/big\.ts \(\d+ токенов\) — `.*diff\.patch`$/)]);
    expect((b.context.hunks as { file: string }[]).map((h) => h.file)).toEqual(["src/ledger/land.ts"]);
    expect(b.tokens).toBeLessThanOrEqual(BUDGET);
    expect(Buffer.byteLength(readFileSync(file, "utf8")) / 4).toBeLessThanOrEqual(BUDGET);
  });
});

describe.concurrent("dev-loop hunks of each axis", { timeout: 30_000 }, () => {
  it("gives Spec in the full wave the hunks of every changed file but the generated ones", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2), "plan/notes.md": "notes\n", "gen/rules.json": "{}\n" });
    const spec = read((await wave(l))["reviewer-spec"]!);
    expect(spec.job).toBe("full");
    expect((spec.context.hunks as { file: string }[]).map((h) => h.file)).toEqual(["plan/notes.md", "src/ledger/land.ts"]);
    expect((spec.context.hunks as { diff: string }[])[1]!.diff).toContain("+  return 2;");
  });

  it("gives the verifier closing a wave the hunks of every file of the delta and only of the delta", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const head = await sh(l.work, "git", ["rev-parse", "HEAD"]);
    const finding = { kind: "rule", rule: "LG-23", where: "src/ledger/land.ts:2", quote: "return 2;", text: "use the port" };
    for (const [agent, brief] of Object.entries(await wave(l)))
      writeFileSync(brief.replace(".in.json", ".out.json"), JSON.stringify({ axis: read(brief).axis, head, summary: "checked", statuses: [], findings: agent === "reviewer-standards" ? [finding] : [] }));
    expect(await dl(l, "merge")).toMatchObject({ ok: true, next: "fix" });
    const fb = (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string;
    await put(l.work, { "src/ledger/land.ts": land(3), "plan/phases/S0-x/tasks/S0-99-x.md": `${TASK}- [ ] the port\n` });
    await sh(l.work, "git", ["commit", "-q", "-am", "S0-99: review — the port"]);
    await sh(l.work, "git", ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
    const fix = await sh(l.work, "git", ["rev-parse", "HEAD"]);
    writeFileSync(fb.replace(".in.json", ".out.json"), JSON.stringify({ status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] }));
    expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
    const v = read((await wave(l))["verifier"]!);
    expect(v.job).toBe("close");
    const hunks = v.context.hunks as { file: string; diff: string }[];
    expect(hunks.map((h) => h.file)).toEqual(["plan/phases/S0-x/tasks/S0-99-x.md", "src/ledger/land.ts"]);
    expect(hunks[1]!.diff).toContain("-  return 2;\n+  return 3;");
  });
});

describe.concurrent("dev-loop briefs of the fixer", { timeout: 30_000 }, () => {
  it("answer: each finding with its hunk, the texts of its rules and the items of CONVENTIONS.md it names or its path falls under", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const head = await sh(l.work, "git", ["rev-parse", "HEAD"]);
    for (const [agent, brief] of Object.entries(await wave(l))) {
      const finding = { kind: "rule", rule: "LG-23, CONVENTIONS §1.4", where: "src/ledger/land.ts:2", quote: "return 2;", text: "use the port" };
      writeFileSync(brief.replace(".in.json", ".out.json"), JSON.stringify({ axis: read(brief).axis, head, summary: "checked", statuses: [], findings: agent === "reviewer-standards" ? [finding] : [] }));
    }
    expect(await dl(l, "merge")).toMatchObject({ ok: true, next: "fix" });
    const b = read((await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string);
    expect(b.context.hunks).toEqual([{ id: "W1-T1", where: "src/ledger/land.ts:2", hunk: "@@ -1,3 +1,3 @@\n export function land(): number {\n-  return 1;\n+  return 2;\n }" }]);
    expect(b.context.rules).toEqual([{ id: "LG-23", text: "| LG-23 | Landing pushes through the git port. |" }]);
    expect(ids(b.context.conventions)).toEqual(["§1.1", "§1.4"]);
    expect(b.cut).toEqual([]);
  });

  it("verify-red: the failed steps of the run from the JSON line of its log, each with its own output", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const log = join(l.dir, "verify.log");
    const outcome = { ok: false, steps: [{ step: "lint:ids", ms: 5, exit: 0 }, { step: "test", ms: 9, exit: 1 }, { step: "build", ms: 3, exit: 2 }], log: "x" };
    writeFileSync(log, `# lint:ids: exit 0, 5 ms\nok\n# test: exit 1, 9 ms\n FAIL test/x.test.ts\n# build: exit 2, 3 ms\nbroken\n${JSON.stringify(outcome)}\n`);
    const b = read((await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "verify-red", "--log", log)).brief as string);
    expect(b.context.failed).toEqual([
      { step: "test", exit: 1, output: "# test: exit 1, 9 ms\n FAIL test/x.test.ts" },
      { step: "build", exit: 2, output: "# build: exit 2, 3 ms\nbroken" },
    ]);
  });
});

describe.concurrent("dev-loop step", { timeout: 30_000 }, () => {
  const selfcheck = async (l: Loop) => (await dl(l, "step", "selfcheck", "--worktree", l.work, "--task", "S0-99")) as Json & { todo: string[]; architecture: { inventory: Json[] } | null; rules: string[] };

  it("selfcheck: a diff without a trigger of Architecture gives no inventory; the items of its paths and the rows of the rules", async () => {
    const s = await selfcheck(await loop({ "src/ledger/land.ts": land(2) }));
    expect(s.architecture).toBeNull();
    expect(s.rules).toEqual(["| LG-23 | `test/fixtures/LG-23/` trigger и pass |", "| ST-01 | — |"]);
    expect(s.todo).toEqual([
      "CONVENTIONS §1.1 «Item §1.1»: src/ledger/land.ts",
      "«Правила» PR: | LG-23 | `test/fixtures/LG-23/` trigger и pass |",
      "ST-01: ничем не показано — фикстуры trigger и pass или тест «ST-01: …»",
    ]);
  });

  it("selfcheck: a new export gives the inventory of closure-check and its steps", async () => {
    const s = await selfcheck(await loop({ "src/ledger/land.ts": `${land(2)}export const LAND = 2;\n` }));
    expect(s.architecture).toMatchObject({ inventory: [{ where: "src/ledger/land.ts:4", text: "export const LAND = 2;" }] });
    expect((s.architecture as unknown as { closure: string }).closure).toBe("## Шаги\n\n1. Inventory.\n\n## Каталог обходов\n\n| Класс |\n|---|\n| order |");
    expect(s.todo[0]).toMatch(/^Architecture: изменены импорты или экспорты/);
  });

  it("selfcheck: a diff only in paths no item of CONVENTIONS.md covers gives an empty list for a task without rules", async () => {
    const l = await loop({ "plan/notes.md": "notes\n", "plan/phases/S0-x/tasks/S0-99-x.md": TASK.replace("rules: [LG-23, ST-01]", "rules: []") });
    expect((await selfcheck(l)).todo).toEqual([]);
  });

  it("pr, deviation and where print the sections of plan-task as written", async () => {
    const skill = readFileSync(join(root, ".claude/skills/plan-task/SKILL.md"), "utf8");
    const at = (heading: string) => skill.indexOf(`## ${heading}`);
    const step = async (name: string) => JSON.parse(await sh(root, process.execPath, [tool, "step", name])) as Json;
    expect((await step("pr")).text).toBe(skill.slice(at("Шаблон описания PR")).trimEnd());
    expect((await step("deviation")).text).toBe(skill.slice(at("Отступления от задачи"), at("Шаблон описания PR")).trimEnd());
    expect((await step("where")).text).toBe(skill.slice(at("Что и куда пишет исполнитель"), at("Отступления от задачи")).trimEnd());
    expect(await step("nothing")).toMatchObject({ ok: false, error: "step: selfcheck | pr | deviation | where" });
  });
});

describe.concurrent("dev-loop context_missing", { timeout: 30_000 }, () => {
  it("accepts a list of lines from every role, refuses anything else, and prints the lines in the final report", async () => {
    const l = await loop({ "src/ledger/land.ts": land(2) });
    const briefs = await wave(l);
    const head = await sh(l.work, "git", ["rev-parse", "HEAD"]);
    const outOf = (brief: string) => brief.replace(".in.json", ".out.json");
    for (const [agent, brief] of Object.entries(briefs)) {
      const axis = read(brief).axis;
      writeFileSync(outOf(brief), JSON.stringify({ axis, head, summary: "checked", statuses: [], findings: [], context_missing: "the glossary" }));
      expect((await dl(l, "check", outOf(brief))).errors).toEqual(['context_missing: the glossary — список строк до 300 знаков: что прочитано сверх brief и зачем']);
      writeFileSync(outOf(brief), JSON.stringify({ axis, head, summary: "checked", statuses: [], findings: [], context_missing: [`${agent}: read the glossary for a term`] }));
    }
    expect(await dl(l, "merge")).toMatchObject({ ok: true });
    const report = readFileSync((await dl(l, "final", "--worktree", l.work)).comment as string, "utf8");
    for (const agent of Object.keys(briefs)) expect(report).toContain(`- waves/1/${agent}: ${agent}: read the glossary for a term`);
    expect(report).toMatch(/\| Brief агента \| Токенов, наибольший \| Токенов, всего \|\n\|---\|---\|---\|\n\| reviewer-/);
    expect(existsSync(join(l.dir, "waves", "1", "diff.patch"))).toBe(true);
  });
});
