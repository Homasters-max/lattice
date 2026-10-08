// dev-loop measures its own loop (S0-46): every step — an agent, the gate, a review round, the owner — keeps
// its start and end in the state of the loop; dl gate runs verify into a log and says where to go; dl final
// prints the critical path, the rounds by their reason and the sizes of the briefs. Time comes through
// DEV_LOOP_NOW, so the cases never wait. The repository is built once and copied for each case (S0-40).
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
let temp = "";
const BRANCH = "s0-99-x";
type Json = { [key: string]: unknown };
type Loop = { work: string; dir: string };
type Files = { readonly [path: string]: string };
type Step = { kind: string; role: string | null; job: string | null; wave: number; start: string; end: string | null; green?: boolean; reason?: string };
// The moment of a command: minute m of one morning.
type At = { at: string; red?: boolean };

const t = (m: number): At => ({ at: new Date(Date.UTC(2026, 9, 8, 10, m)).toISOString() });
const red = (m: number): At => ({ ...t(m), red: true });

function sh(cwd: string, cmd: string, args: string[], env = process.env): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, encoding: "utf8", env }, (error, stdout, stderr) => {
      if (error && cmd === "git") reject(new Error(`git ${args.join(" ")}: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
}

async function commit(work: string, files: Files, message: string): Promise<string> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(work, path)), { recursive: true });
    await writeFile(join(work, path), text);
  }
  await sh(work, "git", ["add", "-A"]);
  await sh(work, "git", ["commit", "-q", "-m", message]);
  await sh(work, "git", ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, "git", ["rev-parse", "HEAD"]);
}

const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;
// verify of the repository: red while RED is set, its output goes to the log of the gate.
const MAIN: Files = {
  "src/ledger/land.ts": land(1),
  "package.json": JSON.stringify({ name: "t", private: true, scripts: { verify: "node verify.mjs" } }) + "\n",
  "verify.mjs": 'if (process.env.RED) {\n  console.log("verify: boom");\n  process.exit(1);\n}\nconsole.log("verify: fine");\n',
};

// A work tree with an origin whose main holds MAIN and a branch with one change; the loop is not started.
async function build(): Promise<string> {
  const root = await mkdtemp(join(temp, "base-"));
  const work = join(root, "work");
  for (const [path, text] of Object.entries(MAIN)) {
    await mkdir(dirname(join(work, path)), { recursive: true });
    await writeFile(join(work, path), text);
  }
  await sh(root, "git", ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, "git", args);
  await sh(work, "git", ["add", "-A"]);
  await sh(work, "git", ["commit", "-q", "-m", "base"]);
  await sh(work, "git", ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await commit(work, { "src/ledger/land.ts": land(2) }, "task");
  return root;
}

let built: Promise<string> | undefined;

async function loop(): Promise<Loop> {
  built ??= build();
  const root = await mkdtemp(join(temp, "case-"));
  await cp(await built, root, { recursive: true });
  const work = join(root, "work");
  await sh(work, "git", ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { work, dir: join(root, "loop") };
}

async function dl(l: Loop, when: At, ...args: string[]): Promise<Json> {
  const env: NodeJS.ProcessEnv = { ...process.env, DEV_LOOP_NOW: when.at };
  if (when.red === true) env.RED = "1";
  else delete env.RED;
  return JSON.parse(await sh(l.work, process.execPath, [tool, ...args, "--dir", l.dir], env)) as Json;
}

const read = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;
const agents = (r: Json) => r.agents as { agent: string; brief: string }[];
const outOf = (brief: string) => brief.replace(".in.json", ".out.json");
const out = (brief: string, value: Json) => writeFileSync(outOf(brief), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, "git", ["rev-parse", "HEAD"]);
const steps = (l: Loop) => read(join(l.dir, "state.json")).steps as Step[];
const BLOCK = { kind: "rule", rule: "CONVENTIONS §1", where: "src/ledger/land.ts:2", quote: "return 2;", text: "magic number; use the constant" };

// A review round from dl wave to dl merge: reviewer-standards finds `findings`, the rest find nothing.
async function round(l: Loop, from: At, to: At, findings: Json[] = [], ...flags: string[]): Promise<Json> {
  const w = await dl(l, from, "wave", "--worktree", l.work, ...flags);
  const h = await head(l);
  for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: h, summary: "checked", statuses: [], findings: a.agent === "reviewer-standards" ? findings : [] });
  return dl(l, to, "merge");
}

// The executor from dl brief to dl check, and dl init from its output.
async function executor(l: Loop, from: At, to: At): Promise<void> {
  const brief = (await dl(l, from, "brief", "executor", "--task", "S0-99", "--worktree", l.work)).brief as string;
  out(brief, { status: "ready", pr: 9, branch: BRANCH, head: await head(l) });
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
  out(agents(w2)[0]!.brief, { axis: "verify", head: fix, summary: "closed", statuses: [{ id: "W1-T1", status: "closed" }], findings: [] });
  expect(await dl(l, t(42), "merge")).toMatchObject({ ok: true, next: "done" });
  await dl(l, t(43), "escalate", "--why", "проверить");
  expect(await dl(l, t(50), "owner", "--text", "стоп")).toMatchObject({ next: "stop" });
  expect(await dl(l, t(52), "owner", "--text", "продолжить")).toMatchObject({ next: "gate" });
  await dl(l, t(53), "gate", "--worktree", l.work);
  expect(await round(l, t(54), t(55))).toMatchObject({ ok: true, wave: 3, next: "done" });
}

function comments(l: Loop): string {
  const d = join(l.dir, "comments");
  const file = join(l.dir, "comments.json");
  writeFileSync(file, JSON.stringify({ comments: readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => ({ body: readFileSync(join(d, f), "utf8") })) }));
  return file;
}

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), "dev-loop-clock-"));
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe.concurrent("dev-loop, the time of every step", { timeout: 60_000 }, () => {
  it("keeps the start and the end of each agent, gate, round and owner in the state, and the comments keep them", async () => {
    const l = await loop();
    await wholeLoop(l);
    const s = steps(l);
    expect(s.map((x) => [x.kind, x.role, x.job, x.wave, x.start, x.end])).toEqual([
      ["agent", "executor", null, 0, t(0).at, t(10).at],
      ["gate", null, null, 0, t(12).at, t(12).at],
      ["agent", "fixer", "verify-red", 0, t(13).at, t(15).at],
      ["gate", null, null, 0, t(16).at, t(16).at],
      ["review", "reviewer", null, 1, t(20).at, t(27).at],
      ["agent", "fixer", "answer", 1, t(28).at, t(38).at],
      ["gate", null, null, 1, t(39).at, t(39).at],
      ["review", "reviewer", null, 2, t(40).at, t(42).at],
      ["owner", null, null, 2, t(43).at, t(50).at],
      ["gate", null, null, 2, t(53).at, t(53).at],
      ["review", "reviewer", null, 3, t(54).at, t(55).at],
    ]);
    expect(s.every((x) => x.end !== null && x.start <= x.end)).toBe(true);
    expect(s.filter((x) => x.kind === "gate").map((x) => x.green)).toEqual([false, true, true, true]);
    expect(s.filter((x) => x.kind === "review").map((x) => x.reason)).toEqual(["first", "block", "owner"]);
    await dl(l, t(60), "final", "--worktree", l.work);
    rmSync(join(l.dir, "state.json"));
    expect(await dl(l, t(61), "restore", "--comments", comments(l))).toMatchObject({ ok: true, entry: "final" });
    expect(steps(l)).toEqual(s);
  });

  it("prints in the final report the critical path, the rounds by their reason and the sizes of the briefs", async () => {
    const l = await loop();
    await wholeLoop(l);
    const report = readFileSync((await dl(l, t(60), "final", "--worktree", l.work)).comment as string, "utf8");
    expect(report).toContain("Критический путь, мин: executor 10.0 → ворота 0.0 → fixer verify-red 2.0 → ворота 0.0 → круг 1 7.0 → fixer answer 10.0 → ворота 0.0 → круг 2 2.0 → владелец 7.0 → ворота 0.0 → круг 3 1.0.");
    expect(report).toContain("Весь цикл 60.0 мин: в шагах 39.0, вне шагов 21.0.");
    for (const row of ["| executor | 1 | 10.0 |", "| ворота | 4, красных 1 | 0.0 |", "| круги: первый | 1 | 7.0 |", "| круги: блокирующие | 1 | 2.0 |", "| круги: tidy | 0 | 0.0 |", "| круги: владелец | 1 | 1.0 |", "| круги: rebase | 0 | 0.0 |", "| fixer | 2 | 12.0 |", "| владелец | 1 | 7.0 |"])
      expect(report).toContain(row);
    const bytes = statSync(join(l.dir, "executor.in.json")).size;
    expect(report).toContain(`| executor | 1 | ${bytes} | ${bytes} |`);
    expect(report).toMatch(/^\| fixer-answer \| 1 \| \d+ \| \d+ \|$/m);
    expect(report).toMatch(/^\| verifier \| 1 \| \d+ \| \d+ \|$/m);
  });

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
    const report = readFileSync((await dl(l, t(12), "final", "--worktree", l.work)).comment as string, "utf8");
    for (const row of ["| круги: tidy | 1 | 1.0 |", "| круги: rebase | 1 | 2.0 |", "| fixer | 2 | 2.0 |"]) expect(report).toContain(row);
  });
});

describe.concurrent("dev-loop gate", { timeout: 60_000 }, () => {
  it("runs verify into the log and goes to the round when it is green, to the fixer when it is red", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const log = join(l.dir, "verify.log");
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: false, log, next: "red" });
    expect(readFileSync(log, "utf8")).toContain("verify: boom");
    expect(await dl(l, t(2), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: true, log, next: "wave" });
    expect(readFileSync(log, "utf8")).toContain("verify: fine");
    expect(readFileSync(log, "utf8")).not.toContain("verify: boom");
  });

  it("asks the owner on the third red in a row; a green gate starts the count again", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
    expect(await dl(l, red(2), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
    expect(await dl(l, red(3), "gate", "--worktree", l.work)).toMatchObject({ green: false, next: "escalate", why: "verify красный трижды" });
    expect(await dl(l, t(4), "gate", "--worktree", l.work)).toMatchObject({ green: true, next: "wave" });
    expect(await dl(l, red(5), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
  });

  it("verifies the head pushed to the branch, and refuses a worktree with changes", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const pushed = await head(l);
    writeFileSync(join(l.work, "local.txt"), "x");
    expect(await dl(l, t(1), "gate", "--worktree", l.work)).toMatchObject({ ok: false, error: "в worktree есть изменения: ворота проверяют запушенный head" });
    await sh(l.work, "git", ["add", "-A"]);
    await sh(l.work, "git", ["commit", "-q", "-m", "local"]);
    expect(await dl(l, t(2), "gate", "--worktree", l.work)).toMatchObject({ ok: true, head: pushed, green: true });
    expect(await head(l)).toBe(pushed);
  });
});
