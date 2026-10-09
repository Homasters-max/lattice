// dev-loop measures its own loop (S0-46): every step — an agent, the gate, a review round, the owner — keeps
// its start and end in the state of the loop; dl final prints the critical path, the rounds by their reason and the
// sizes of the briefs. The gate itself is the cases of dev-loop-gate.test.ts. Time comes through DEV_LOOP_NOW, so the
// cases never wait. The repository is built once and copied for each case (S0-40).
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { NO_MAINTENANCE } from "../support/git.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
let temp: Scratch;
let folders = 0;
// The fake gh of the tool: dl wave asks GitHub for the body of the PR for the brief of Spec (S0-48).
let gh = "";
const BRANCH = "s0-99-x";
type Json = { [key: string]: unknown };
type Loop = { work: string; dir: string };
type Files = { readonly [path: string]: string };
type Step = { kind: string; role: string | null; job: string | null; wave: number; head: string | null; start: string; end: string | null; green?: boolean; reason?: string };
// The moment of a command: minute m of one morning; red — the prove the gate runs fails.
type At = { at: string; red?: boolean };

const t = (m: number): At => ({ at: new Date(Date.UTC(2026, 9, 8, 10, m)).toISOString() });
const red = (m: number): At => ({ ...t(m), red: true });

async function sh(cwd: string, cmd: Program, args: readonly string[], env = process.env): Promise<string> {
  const ran = await cmd.start(args, { cwd, env });
  if (ran.status !== 0 && cmd === git) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

async function commit(work: string, files: Files, message: string): Promise<string> {
  for (const [path, text] of Object.entries(files)) temp.write(join(work, path), text);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", message]);
  await sh(work, git, ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, git, ["rev-parse", "HEAD"]);
}

const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;
// prove of the repository, which dl gate runs (S0-43): red while RED is set, its output goes to the log of the gate.
// CONVENTIONS.md holds the item findings name (CONVENTIONS §N.M).
const MAIN: Files = {
  "src/ledger/land.ts": land(1),
  "CONVENTIONS.md": "# C\n\n## 1. A\n\n### §1.1 One\nОбласть: `src/**`\n",
  "package.json": JSON.stringify({ name: "t", private: true, scripts: { prove: "node prove.mjs" } }) + "\n",
  "prove.mjs": ["const red = Boolean(process.env.RED);", 'console.log(red ? "prove: boom" : "prove: fine");', "process.exit(red ? 1 : 0);", ""].join("\n"),
  // The task the executor hands in: dl check reads the items it names done (S0-51).
  "plan/phases/S0-x/tasks/S0-99-x.md": "---\nid: S0-99\ntitle: X\nphase: S0\n---\n\n## Готово, когда\n\n- [ ] land works\n",
};

// A work tree with an origin whose main holds MAIN and a branch with one change; the loop is not started.
async function build(): Promise<string> {
  const root = folder("base-");
  const work = join(root, "work");
  for (const [path, text] of Object.entries(MAIN)) temp.write(join(work, path), text);
  await sh(root, git, ["init", "-q", "--template=", "--bare", "origin.git"]);
  await sh(join(root, "origin.git"), git, NO_MAINTENANCE);
  for (const args of [["init", "-q", "--template="], NO_MAINTENANCE, ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, git, args);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "base"]);
  await sh(work, git, ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await commit(work, { "src/ledger/land.ts": land(2) }, "task");
  return root;
}

let built: Promise<string> | undefined;

async function loop(): Promise<Loop> {
  built ??= build();
  const from = await built;
  const root = folder("case-");
  temp.copy(from, root);
  const work = join(root, "work");
  await sh(work, git, ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { work, dir: join(root, "loop") };
}

async function dl(l: Loop, when: At, ...args: string[]): Promise<Json> {
  const env: NodeJS.ProcessEnv = { ...process.env, DEV_LOOP_GH: gh, DEV_LOOP_NOW: when.at };
  if (when.red === true) env.RED = "1";
  else delete env.RED;
  return JSON.parse(await sh(l.work, tool, [...args, "--dir", l.dir], env)) as Json;
}

const read = (file: string): Json => JSON.parse(temp.text(file)) as Json;
const agents = (r: Json) => r.agents as { agent: string; brief: string }[];
const outOf = (brief: string) => brief.replace(".in.json", ".out.json");
const out = (brief: string, value: Json) => temp.write(outOf(brief), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, git, ["rev-parse", "HEAD"]);
const steps = (l: Loop) => read(join(l.dir, "state.json")).steps as Step[];
const BLOCK = { kind: "rule", rule: "CONVENTIONS §1.1", where: "src/ledger/land.ts:2", quote: "return 2;", text: "magic number; use the constant" };

// A review round from dl wave to dl merge: reviewer-standards finds `findings`, the rest find nothing.
async function round(l: Loop, from: At, to: At, findings: Json[] = []): Promise<Json> {
  const w = await dl(l, from, "wave", "--worktree", l.work);
  const h = await head(l);
  for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: h, summary: "checked", statuses: [], findings: a.agent === "reviewer-standards" ? findings : [] });
  return dl(l, to, "merge");
}

// The executor from dl brief to dl check, and dl init from its output.
async function executor(l: Loop, from: At, to: At): Promise<void> {
  const brief = (await dl(l, from, "brief", "executor", "--task", "S0-99", "--worktree", l.work)).brief as string;
  out(brief, { status: "ready", pr: 9, branch: BRANCH, head: await head(l), done: ["land works"] });
  expect(await dl(l, to, "check", outOf(brief))).toMatchObject({ ok: true, status: "ready" });
  expect(await dl(l, to, "init", "--task", "S0-99", "--from", outOf(brief))).toMatchObject({ ok: true, existed: false });
}

// A fixer of a job without findings (verify-red, rebase, owner) from dl brief to dl check.
async function fixer(l: Loop, from: At, to: At, job: string): Promise<void> {
  const brief = (await dl(l, from, "brief", "fixer", "--worktree", l.work, "--job", job, "--log", join(l.dir, "verify.log"))).brief as string;
  out(brief, { status: "done", head: await head(l), answers: [] });
  expect(await dl(l, to, "check", outOf(brief))).toMatchObject({ ok: true, status: "done" });
}

// The whole loop of the first case: every kind of step, one after another.
async function wholeLoop(l: Loop): Promise<void> {
  await executor(l, t(0), t(10));
  expect(await dl(l, red(12), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: false, next: "red" });
  await fixer(l, t(13), t(15), "verify-red");
  expect(await dl(l, t(16), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: true, next: "wave" });
  expect(await round(l, t(20), t(27), [BLOCK])).toMatchObject({ ok: true, next: "fix" });
  const fb = (await dl(l, t(28), "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string;
  const fix = await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: review — constant");
  out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] });
  expect(await dl(l, t(38), "answer")).toMatchObject({ ok: true, status: "done" });
  await dl(l, t(39), "gate", "--worktree", l.work);
  const w2 = await dl(l, t(40), "wave", "--worktree", l.work);
  // The fix edited the hunk: Spec and Standards review it again, the verifier closes the answered finding (S0-45).
  for (const a of agents(w2)) out(a.brief, { axis: read(a.brief).axis, head: fix, summary: "closed", statuses: a.agent === "verifier" ? [{ id: "W1-T1", status: "closed" }] : [], findings: [] });
  expect(await dl(l, t(42), "merge")).toMatchObject({ ok: true, next: "done" });
  await dl(l, t(43), "escalate", "--why", "проверить");
  expect(await dl(l, t(50), "owner", "--text", "стоп")).toMatchObject({ next: "stop" });
  // The gate at minute 39 is green on the head, and nothing pushed since: «продолжить» goes to the round, not the gate (S0-43).
  expect(await dl(l, t(52), "owner", "--text", "продолжить")).toMatchObject({ next: "wave" });
  expect(await round(l, t(54), t(55))).toMatchObject({ ok: true, wave: 3, next: "done" });
}

function comments(l: Loop): string {
  const d = join(l.dir, "comments");
  const file = join(l.dir, "comments.json");
  temp.write(file, JSON.stringify({ comments: temp.list(d).filter((f) => f.endsWith(".md")).map((f) => ({ body: temp.text(join(d, f)) })) }));
  return file;
}

beforeAll(() => {
  temp = scratch("dev-loop-clock-");
  gh = temp.write("gh.mjs", 'console.log(JSON.stringify({ body: "PR body" }));\n');
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop, the time of every step", { timeout: 60_000 }, () => {
  it("keeps the start and the end of each agent, gate, round and owner in the state, and the comments keep them", async () => {
    const l = await loop();
    // task — the head the executor pushed; fix — the head the fixer pushed, the head of every later step.
    const task = await head(l);
    await wholeLoop(l);
    const fix = await sh(l.work, git, ["rev-parse", `origin/${BRANCH}`]);
    expect(fix).not.toBe(task);
    const s = steps(l);
    expect(s.map((x) => [x.kind, x.role, x.job, x.wave, x.head, x.start, x.end])).toEqual([
      ["agent", "executor", null, 0, task, t(0).at, t(10).at],
      ["gate", null, null, 0, task, t(12).at, t(12).at],
      ["agent", "fixer", "verify-red", 0, task, t(13).at, t(15).at],
      ["gate", null, null, 0, task, t(16).at, t(16).at],
      ["review", "reviewer", null, 1, task, t(20).at, t(27).at],
      ["agent", "fixer", "answer", 1, fix, t(28).at, t(38).at],
      ["gate", null, null, 1, fix, t(39).at, t(39).at],
      ["review", "reviewer", null, 2, fix, t(40).at, t(42).at],
      ["owner", null, null, 2, fix, t(43).at, t(50).at],
      ["review", "reviewer", null, 3, fix, t(54).at, t(55).at],
    ]);
    expect(s.every((x) => x.end !== null && x.start <= x.end)).toBe(true);
    expect(s.filter((x) => x.kind === "gate").map((x) => x.green)).toEqual([false, true, true]);
    expect(s.filter((x) => x.kind === "review").map((x) => x.reason)).toEqual(["first", "block", "owner"]);
    await dl(l, t(60), "final", "--worktree", l.work);
    temp.remove(join(l.dir, "state.json"));
    expect(await dl(l, t(61), "restore", "--comments", comments(l))).toMatchObject({ ok: true, entry: "final" });
    expect(steps(l)).toEqual(s);
  });

  it("prints in the final report the critical path, the rounds by their reason and the sizes of the briefs", async () => {
    const l = await loop();
    await wholeLoop(l);
    const report = temp.text((await dl(l, t(60), "final", "--worktree", l.work)).comment as string);
    expect(report).toContain("Критический путь, мин: executor 10.0 → ворота 0.0 → fixer verify-red 2.0 → ворота 0.0 → круг 1 7.0 → fixer answer 10.0 → ворота 0.0 → круг 2 2.0 → владелец 7.0 → круг 3 1.0.");
    expect(report).toContain("Весь цикл 60.0 мин: в шагах 39.0, вне шагов 21.0.");
    for (const row of ["| executor | 1 | 10.0 |", "| ворота | 3, красных 1 | 0.0 |", "| круги: первый | 1 | 7.0 |", "| круги: блокирующие | 1 | 2.0 |", "| круги: tidy | 0 | 0.0 |", "| круги: владелец | 1 | 1.0 |", "| круги: rebase | 0 | 0.0 |", "| fixer | 2 | 12.0 |", "| владелец | 1 | 7.0 |"])
      expect(report).toContain(row);
    // Each brief of the loop is on disk once: the table holds, by its name, the count, the largest and the sum of their sizes.
    const sizes = new Map<string, number[]>();
    for (const file of temp.list(l.dir, { recursive: true }).filter((f) => f.endsWith(".in.json"))) {
      const name = basename(file, ".in.json");
      sizes.set(name, [...(sizes.get(name) ?? []), temp.bytes(join(l.dir, file)).length]);
    }
    expect([...sizes.keys()]).toEqual(expect.arrayContaining(["executor", "fixer-verify-red", "fixer-answer", "verifier", "reviewer-standards"]));
    const rows = [...sizes].map(([name, b]) => `| ${name} | ${b.length} | ${Math.max(...b)} | ${b.reduce((x, y) => x + y, 0)} |`);
    // The brief table is the last of the report; its first row is the header.
    const table = report.slice(report.indexOf("| Brief |")).split("\n").filter((line) => line.startsWith("| ")).slice(1);
    expect(table.sort()).toEqual(rows.sort());
  });
});

describe.concurrent("dev-loop, a fixer who asks the owner", { timeout: 60_000 }, () => {
  it("ends the step of a fixer who asks the owner at dl answer, so the wait for the owner is the owner's step", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await round(l, t(1), t(2), [BLOCK])).toMatchObject({ ok: true, next: "fix" });
    const fb = (await dl(l, t(3), "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string;
    const question = { text: "Which constant?", options: ["LAND", "ONE"], recommendation: "LAND" };
    out(fb, { status: "needs_owner", head: await head(l), answers: [], question });
    expect(await dl(l, t(5), "answer")).toMatchObject({ ok: true, status: "needs_owner" });
    expect(await dl(l, t(6), "escalate", "--why", "вопрос исправляющего", "--from", outOf(fb))).toMatchObject({ ok: true });
    expect(await dl(l, t(9), "owner", "--text", "LAND")).toMatchObject({ ok: true });
    expect(steps(l).map((x) => [x.kind, x.role, x.job, x.start, x.end])).toEqual([
      ["review", "reviewer", null, t(1).at, t(2).at],
      ["agent", "fixer", "answer", t(3).at, t(5).at],
      ["owner", null, null, t(6).at, t(9).at],
    ]);
  });
});

describe.concurrent("dev-loop, the reason of each round", { timeout: 60_000 }, () => {
  it("names a round after tidy and a round after a rebase by their reason", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await round(l, t(1), t(2), [{ ...BLOCK, kind: "advice", rule: "" }])).toMatchObject({ next: "tidy" });
    const tb = (await dl(l, t(3), "brief", "fixer", "--worktree", l.work, "--job", "tidy")).brief as string;
    out(tb, { status: "done", head: await head(l), answers: [{ id: "W1-T1", action: "fixed", commits: [await head(l)] }] });
    expect(await dl(l, t(4), "answer", "--job", "tidy")).toMatchObject({ ok: true, status: "done" });
    expect(await round(l, t(5), t(6))).toMatchObject({ ok: true, wave: 2 });
    await fixer(l, t(7), t(8), "rebase");
    const w3 = await dl(l, t(9), "wave", "--worktree", l.work, "--conflicts", "src/ledger/land.ts");
    out(agents(w3)[0]!.brief, { axis: "verify", head: await head(l), summary: "joined", statuses: [], findings: [] });
    expect(await dl(l, t(11), "merge")).toMatchObject({ ok: true, wave: 3 });
    expect(steps(l).filter((x) => x.kind === "review").map((x) => x.reason)).toEqual(["first", "tidy", "rebase"]);
    const report = temp.text((await dl(l, t(12), "final", "--worktree", l.work)).comment as string);
    for (const row of ["| круги: tidy | 1 | 1.0 |", "| круги: rebase | 1 | 2.0 |", "| fixer | 2 | 2.0 |"]) expect(report).toContain(row);
  });
});
