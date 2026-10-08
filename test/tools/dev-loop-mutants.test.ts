// The author decides every mutant of the changed hunks of src/ that survived `npm run prove --ready` (S0-44): dl check
// refuses an output of the executor or the fixer without the report on its head or with a survivor it did not decide —
// killed by a test in a commit of the branch, equivalent or deferred with a reason; dl remembers a decision by the id of
// the mutant and does not ask for it again; the brief of Spec carries the report and the decisions. As ST-13 has it for
// an implementation, what code can check is checked: that a test fails when a check is broken is shown by a run, not by
// the reviewer; what no operator sees stays the review boundary of Spec. The cases name no rule ID: they show the tool,
// not a rule of the design.
// Each case runs the tool on a throwaway repository with an origin; GitHub is a fake gh.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedMutants } from "../../scripts/mutants.mjs";
import { scratch, type Scratch } from "../support/files.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
const BRANCH = "s0-99-x";
let temp: Scratch;
let folders = 0;
let gh = "";
type Json = { [key: string]: unknown };
type Loop = { work: string; dir: string };
type Files = { readonly [path: string]: string };

async function sh(cwd: string, cmd: Program, args: string[]): Promise<string> {
  const ran = await cmd.start(args, { cwd, env: { ...process.env, DEV_LOOP_GH: gh } });
  if (ran.status !== 0 && cmd === git) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

const TASK = ["---", "id: S0-99", "title: X", "phase: S0", "modules: [ledger]", "rules: []", "---", "", "# S0-99", "", "## Готово, когда", "", "- [ ] land works", ""].join("\n");
const MAIN: Files = {
  ".gitignore": ".lattice/\n",
  "plan/phases/S0-x/tasks/S0-99-x.md": TASK,
  "plan/phases/S0-x/PLAN.md": "# S0\n",
  "plan/phases/S0-x/STATUS.md": "# S0\n",
  "src/ledger/land.ts": "export function land(n: number): number {\n  return n;\n}\n",
};
// The change: a refusal under a boundary — two mutants, one of each operator.
const LAND = 'export function land(n: number): number {\n  if (n < 0) throw new Error("LG-23: negative");\n  return n;\n}\n';

function put(work: string, files: Files): void {
  for (const [path, text] of Object.entries(files)) temp.write(join(work, path), text);
}

async function commit(work: string, files: Files, message: string): Promise<string> {
  put(work, files);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", message]);
  await sh(work, git, ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, git, ["rev-parse", "HEAD"]);
}

// A work tree whose origin's main holds MAIN, the branch with LAND committed and pushed, and a loop — initialised unless
// `init` is false.
async function loop(init = true): Promise<Loop> {
  const base = temp.mkdir(`case-${++folders}`);
  const work = join(base, "work");
  put(work, MAIN);
  await sh(base, git, ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(base, "origin.git")]]) await sh(work, git, args);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "base"]);
  await sh(work, git, ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await commit(work, { "src/ledger/land.ts": LAND }, "task");
  const l = { work, dir: join(base, "loop") };
  if (init) await dl(l, "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
  return l;
}

const dl = async (l: Loop, ...args: string[]): Promise<Json> => JSON.parse(await sh(l.work, tool, [...args, "--dir", l.dir])) as Json;
const head = (l: Loop) => sh(l.work, git, ["rev-parse", "HEAD"]);
const read = (file: string): Json => JSON.parse(temp.text(file)) as Json;

/**
 * The mutants of the branch by operator, as dl computes them, and the report of prove --ready with these outcomes at the
 * head; a mutant whose operator has no outcome is not in the report.
 */
async function report(l: Loop, outcomes: { readonly [operator: string]: string }, extra: Json = {}): Promise<{ [operator: string]: string }> {
  const { mutants } = changedMutants({ dir: l.work, base: "origin/main" });
  const entries = mutants.filter((m) => m.operator in outcomes).map((m) => ({ ...m, tests: ["ledger"], outcome: outcomes[m.operator], killer: outcomes[m.operator] === "killed" ? "test/ledger/land.test.ts > lands" : null, cached: false }));
  put(l.work, { ".lattice/mutants.json": JSON.stringify({ head: await head(l), dirty: false, base: "x", mutants: entries, ...extra }) });
  return Object.fromEntries(mutants.map((m) => [m.operator, m.id]));
}

/** The errors of dl check for an output of the executor beside its brief. */
async function executor(l: Loop, out: Json = {}): Promise<string[]> {
  const brief = (await dl(l, "brief", "executor", "--task", "S0-99", "--worktree", l.work)).brief as string;
  const file = brief.replace(".in.json", ".out.json");
  temp.write(file, JSON.stringify({ status: "ready", pr: 9, branch: BRANCH, head: await head(l), done: ["land works"], ...out }));
  return (await dl(l, "check", file)).errors as string[];
}

/** The errors of dl check for an output `done` of the fixer beside its brief. */
async function fixer(l: Loop, out: Json = {}): Promise<string[]> {
  const brief = (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "verify-red")).brief as string;
  const file = brief.replace(".in.json", ".out.json");
  temp.write(file, JSON.stringify({ status: "done", head: await head(l), answers: [], ...out }));
  return (await dl(l, "check", file)).errors as string[];
}

beforeAll(() => {
  temp = scratch("dev-loop-mutants-");
  gh = temp.write("gh.mjs", 'console.log(JSON.stringify({ body: "PR body" }));\n');
});

afterAll(() => {
  temp.remove();
});

// A case runs dl check some times, and each run loads typescript to find the mutants: under the load of a whole run
// of the tests that takes more than the default.
const TIMEOUT = 60_000;

describe.concurrent("dev-loop check, the report of prove --ready", { timeout: TIMEOUT }, () => {
  it("refuses an output of the executor without the report, and with the report taken with uncommitted edits", async () => {
    const l = await loop();
    expect(await executor(l)).toEqual([expect.stringMatching(/^mutants: нет отчёта — нужен \.lattice\/mutants\.json `npm run prove --ready` на head \w{7} без незакоммиченных правок: мутантов в изменённых hunk'ах src\/ — 2$/)]);
    const ids = await report(l, { boundary: "survived", refusal: "killed" }, { dirty: true });
    expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "equivalent", reason: "no input below zero" }] })).toEqual([
      expect.stringMatching(/^mutants: отчёт снят с незакоммиченными правками — /),
    ]);
  });

  it("refuses the report taken at another commit, and the report that does not name a mutant of the head", async () => {
    const l = await loop();
    const before = await sh(l.work, git, ["rev-parse", "HEAD~1"]);
    await report(l, { boundary: "killed", refusal: "killed" }, { head: before });
    expect(await executor(l)).toEqual([expect.stringMatching(new RegExp(`^mutants: отчёт на ${before.slice(0, 7)} — нужен .* на head \\w{7} `))]);
    const ids = await report(l, { boundary: "killed" });
    expect(await executor(l)).toEqual([`mutants: отчёт на head не называет мутантов: ${ids.refusal} src/ledger/land.ts:2 — нужен новый \`npm run prove --ready\``]);
  });
});

describe.concurrent("dev-loop init, the decisions of the executor", { timeout: TIMEOUT }, () => {
  // init without a state makes one, and with the state of start keeps it: either way the decisions of the executor,
  // checked before there was a state, go into it.
  for (const started of [false, true])
    it(`init ${started ? "into the state of start" : "of a new state"} carries the decisions of the executor: the fixer is not asked for them again`, async () => {
      const l = await loop(false);
      const ids = await report(l, { boundary: "survived", refusal: "killed" });
      expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "equivalent", reason: "no input below zero" }] })).toEqual([]);
      if (started) await dl(l, "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
      expect(await dl(l, "init", "--task", "S0-99", "--from", join(l.dir, "executor.out.json"))).toMatchObject({ ok: true, existed: started });
      expect(await fixer(l)).toEqual([]);
    });
});

describe.concurrent("dev-loop check, the survivors of prove --ready", { timeout: TIMEOUT }, () => {
  it("refuses an output of the executor, and an output done of the fixer, with a survivor it did not decide and dl does not remember", async () => {
    const l = await loop();
    const ids = await report(l, { boundary: "survived", refusal: "killed" });
    const undecided = `mutants: выживший ${ids.boundary} не решён — src/ledger/land.ts:2 boundary: < → <=; нужно killed, equivalent или deferred`;
    expect(await executor(l)).toEqual([undecided]);
    expect(await fixer(l)).toEqual([undecided]);
    expect(await fixer(l, { mutants: [{ id: ids.boundary, decision: "deferred", reason: "G-01 of the plan" }] })).toEqual([]);
  });

  it("accepts a survivor decided equivalent or deferred with a reason, and killed only when the report at the head shows it killed", async () => {
    const l = await loop();
    const ids = await report(l, { boundary: "survived", refusal: "killed" });
    const h = await head(l);
    expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "deferred" }] })).toEqual([`mutants.${ids.boundary}.reason: нет — почему мутант отложен и где это записано, до 300 знаков`]);
    expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "killed", commit: "0000000" }, { id: "feedfacefeedface", decision: "equivalent", reason: "x" }] })).toEqual([
      `mutants.${ids.boundary}: killed — но в отчёте на head мутант survived: тест, который его убивает, не в head`,
      `mutants.${ids.boundary}.commit: 0000000 — коммит ветки с тестом, который убивает мутанта`,
      "mutants.feedfacefeedface: нет такого мутанта в изменённых hunk'ах src/ на head",
    ]);
    await report(l, { boundary: "killed", refusal: "killed" });
    expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "killed", commit: h }] })).toEqual([]);
  });

  it("remembers a decision by the id of the mutant: the fixer is not asked for it again, and Spec gets the report with it", async () => {
    const l = await loop();
    const ids = await report(l, { boundary: "survived", refusal: "killed" });
    expect(await executor(l, { mutants: [{ id: ids.boundary, decision: "equivalent", reason: "no input below zero" }] })).toEqual([]);
    expect(await fixer(l)).toEqual([]);

    const w = await dl(l, "wave", "--worktree", l.work);
    const spec = read((w.agents as { agent: string; brief: string }[]).find((a) => a.agent === "reviewer-spec")!.brief) as { context: Json };
    expect(spec.context.mutation).toMatchObject({ report: ".lattice/mutants.json", head: await head(l), total: 2, killed: 1, survived: 1 });
    expect((spec.context.mutants as Json[]).map((m) => [m.id, m.outcome, m.decision])).toEqual([
      [ids.boundary, "survived", { decision: "equivalent", reason: "no input below zero", by: "executor" }],
      [ids.refusal, "killed", null],
    ]);
  });
});
