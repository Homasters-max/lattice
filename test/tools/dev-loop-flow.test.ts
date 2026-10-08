// dev-loop drives a review loop through files and one-line JSON (plan/dev-loop.md); these cases run
// the tool on a throwaway repository with an origin: a loop that converges and resumes from its comments,
// a dispute the owner settles, a stop the owner answers, and outputs of agents the protocol refuses.
// The repository and its loop are built once and copied for each case; the cases run concurrently (S0-40).
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function sh(cwd: string, cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error && cmd === "git") reject(new Error(`git ${args.join(" ")}: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
}

// Commits the files and pushes the branch, as an agent does before it answers.
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

const TASK: Files = { "src/ledger/land.ts": land(2) };
const NO_MAIN: Files = {};

// A work tree with an origin whose main is the base and the main files, a branch with one change, and an initialised loop.
// Steps that do not depend on each other run together: the build is on the path of every case.
async function build(change: Files, main: Files): Promise<string> {
  const root = await mkdtemp(join(temp, "base-"));
  const work = join(root, "work");
  for (const [path, text] of Object.entries({ "src/ledger/land.ts": land(1), ...main })) {
    await mkdir(dirname(join(work, path)), { recursive: true });
    await writeFile(join(work, path), text);
  }
  // --template= leaves out the sample hooks: a repository without them copies several times faster.
  const origin = sh(root, "git", ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, "git", args);
  await sh(work, "git", ["add", "-A"]);
  await sh(work, "git", ["commit", "-q", "-m", "base"]);
  await origin;
  // The push also sets origin/main and origin/<branch> of the work tree, as a fetch would.
  await sh(work, "git", ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await Promise.all([commit(work, change, "task"), dl({ work, dir: join(root, "loop") }, "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH)]);
  return root;
}

// The built repository of each change and main, by their text: a case copies it rather than builds it again.
const built = new Map<string, Promise<string>>();

// A copy of the repository built for the change and main, its origin moved with it.
async function loop(change: Files = TASK, main: Files = NO_MAIN): Promise<Loop> {
  const key = JSON.stringify([change, main]);
  let source = built.get(key);
  if (source === undefined) {
    source = build(change, main);
    built.set(key, source);
  }
  const root = await mkdtemp(join(temp, "case-"));
  await cp(await source, root, { recursive: true });
  const work = join(root, "work");
  await sh(work, "git", ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { work, dir: join(root, "loop") };
}

async function dl(l: Loop, ...args: string[]): Promise<Json> {
  return JSON.parse(await sh(l.work, process.execPath, [tool, ...args, ...(args[0] === "check" ? [] : ["--dir", l.dir])])) as Json;
}

const read = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;
const agents = (r: Json) => r.agents as { agent: string; brief: string }[];
const out = (brief: string, value: Json) => writeFileSync(brief.replace(".in.json", ".out.json"), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, "git", ["rev-parse", "HEAD"]);
const BLOCK = { kind: "rule", rule: "CONVENTIONS §1", where: "src/ledger/land.ts:2", quote: "return 2;", text: "magic number; use the constant" };
const fixerBrief = async (l: Loop) => (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string;

async function round(l: Loop, findings: Json[]): Promise<Json> {
  const w = await dl(l, "wave", "--worktree", l.work);
  const h = await head(l);
  for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: h, summary: "checked", statuses: [], findings: a.agent === "reviewer-standards" ? findings : [] });
  return dl(l, "merge");
}

function comments(l: Loop): string {
  const d = join(l.dir, "comments");
  const file = join(l.dir, "comments.json");
  writeFileSync(file, JSON.stringify({ comments: readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => ({ body: readFileSync(join(d, f), "utf8") })) }));
  return file;
}

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), "dev-loop-flow-"));
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe.concurrent("dev-loop, a loop that converges", { timeout: 30_000 }, () => {
  it("finds, answers, checks the closure and ends; the comments restore the state", async () => {
    const l = await loop();
    const m1 = await round(l, [BLOCK]);
    expect(m1).toMatchObject({ ok: true, wave: 1, next: "fix", open: ["W1-T1"] });
    expect(readFileSync(m1.comment as string, "utf8")).toMatch(/^<!-- dev-loop \{"kind":"review"[\s\S]*\*\*W1-T1\*\* · блокирует · CONVENTIONS §1/);
    const fb = await fixerBrief(l);
    const fix = await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: review — constant");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix], note: "constant" }] });
    expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done", disputed: [] });
    expect(await dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "answer", next: "gate" });

    const w2 = await dl(l, "wave", "--worktree", l.work);
    expect(w2).toMatchObject({ wave: 2, mode: "verify" });
    expect(agents(w2).map((a) => a.agent)).toEqual(["verifier"]);
    out(agents(w2)[0]!.brief, { axis: "verify", head: fix, summary: "closed", statuses: [{ id: "W1-T1", status: "closed" }], findings: [] });
    expect(await dl(l, "merge")).toMatchObject({ ok: true, wave: 2, next: "done", open: [] });
    expect(await dl(l, "merge")).toMatchObject({ ok: false, error: "нет круга 3: сначала wave" });

    const fin = (await dl(l, "final", "--worktree", l.work)).comment as string;
    expect(readFileSync(fin, "utf8")).toContain("| 2 | проверка закрытия | Проверка закрытия | — | W1-T1 |");
    expect(await dl(l, "restore", "--comments", comments(l))).toMatchObject({ ok: true, entry: "final", wave: 2, next: "end" });
  });
});

describe.concurrent("dev-loop, the owner decides", { timeout: 30_000 }, () => {
  it("escalates a kept dispute and closes the finding by the owner's decision", async () => {
    const l = await loop();
    await round(l, [BLOCK]);
    out(await fixerBrief(l), { status: "done", head: await head(l), answers: [{ id: "W1-T1", action: "disputed", note: "CONVENTIONS §5 allows it" }] });
    expect(await dl(l, "answer")).toMatchObject({ ok: true, disputed: ["W1-T1"] });
    const w2 = await dl(l, "wave", "--worktree", l.work);
    expect(agents(w2).map((a) => a.agent)).toEqual(["reviewer-standards"]);
    out(agents(w2)[0]!.brief, { axis: "standards", head: await head(l), summary: "kept", statuses: [{ id: "W1-T1", status: "dispute-kept", note: "§1 names it" }], findings: [] });
    expect(await dl(l, "merge")).toMatchObject({ next: "escalate" });
    const e = await dl(l, "escalate", "--why", "спор");
    expect((read(e.questions as string) as unknown as Json[])[0]).toMatchObject({ header: "W1-T1" });
    expect(await dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "escalation", next: "ask" });
    writeFileSync(join(l.dir, "a.json"), JSON.stringify({ "W1-T1": { action: "чинить" } }));
    expect((await dl(l, "owner", "--answers", join(l.dir, "a.json"))).errors).toEqual(["W1-T1.action: fix | drop | task | gap | stop"]);
    writeFileSync(join(l.dir, "a.json"), JSON.stringify({ "W1-T1": { action: "drop", note: "§5 wins" } }));
    expect(await dl(l, "owner", "--answers", join(l.dir, "a.json"))).toMatchObject({ ok: true, next: "done" });
  });

  it("stops before review on docs/design and turns the owner's answer into an instruction to the fixer", async () => {
    const l = await loop({ "docs/design/05-ledger.md": "# Ledger\n" });
    const w = await dl(l, "wave", "--worktree", l.work);
    expect(w).toMatchObject({ next: "owner", why: "docs/design изменён без записи в discussion/decisions.md (AGENTS.md)" });
    const e = await dl(l, "escalate", "--why", w.why as string);
    expect((read(e.questions as string) as unknown as Json[])[0]).toMatchObject({ header: "Решение" });
    expect(await dl(l, "owner", "--text", "запиши решение D-20")).toMatchObject({ ok: true, next: "instruct" });
    expect(read((await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "owner")).brief as string)).toMatchObject({ job: "owner", owner: "запиши решение D-20" });
    expect(await dl(l, "owner", "--text", "x")).toMatchObject({ ok: false, errors: ["владельца ни о чём не спрашивали"] });
  });

  it("resumes a stopped loop by the owner's answer: on to the gate, or an instruction to the fixer", () => {
    const l = loop();
    round(l, [BLOCK]);
    const fb = fixerBrief(l);
    const fix = commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: review — constant");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] });
    expect(dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
    dl(l, "escalate", "--why", "проверить");
    expect(dl(l, "owner", "--text", "стоп")).toMatchObject({ ok: true, next: "stop" });
    expect(dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "decision", next: "stop" });
    expect(dl(l, "owner", "--text", "продолжить")).toMatchObject({ ok: true, next: "gate" });
    expect(dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "decision", next: "gate" });

    dl(l, "escalate", "--why", "проверить");
    expect(dl(l, "owner", "--text", "стоп")).toMatchObject({ next: "stop" });
    expect(dl(l, "owner", "--text", "верни константу")).toMatchObject({ ok: true, next: "instruct" });
    expect(dl(l, "owner", "--text", "x")).toMatchObject({ ok: false, errors: ["владельца ни о чём не спрашивали"] });
  });
});

describe.concurrent("dev-loop, outputs the protocol refuses", { timeout: 30_000 }, () => {
  it("refuses a reviewer that misses a status, disputes nothing or reviews another head", async () => {
    const l = await loop();
    await round(l, [BLOCK]);
    const fb = await fixerBrief(l);
    const fix = await commit(l.work, { "src/ledger/land.ts": land(3) }, "fix");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] });
    await dl(l, "answer");
    const v = agents(await dl(l, "wave", "--worktree", l.work))[0]!.brief;
    out(v, { axis: "verify", head: "", summary: "x", statuses: [{ id: "W1-T1", status: "dispute-kept", note: "n" }], findings: [null] });
    const errors = ((await dl(l, "merge")).errors as { [agent: string]: string[] }).verifier!;
    expect(errors).toEqual([`head: ${fix}`, "findings: список объектов", "statuses.W1-T1: dispute-kept — автор не оспаривал"]);
    out(v, { axis: "verify", head: fix, summary: "x", statuses: [], findings: [] });
    expect((await dl(l, "check", v.replace(".in.json", ".out.json"))).errors).toEqual(["statuses: нет статуса для W1-T1"]);
  });

  it("refuses an answer twice to one finding, a commit outside the answer, a dispute without a rule and an unpushed head", async () => {
    const l = await loop();
    await round(l, [BLOCK, { ...BLOCK, where: "src/ledger/land.ts:9", text: "other" }]);
    const fb = await fixerBrief(l);
    const base = (read(fb).base as string).slice(0, 7);
    const h = await head(l);
    out(fb, { status: "done", head: h, answers: [{ id: "W1-T1", action: "fixed", commits: [h] }, { id: "W1-T1", action: "disputed", note: "CONVENTIONS §2" }, { id: "W1-T2", action: "disputed", note: "no" }] });
    expect((await dl(l, "answer")).errors).toEqual(["answers: на находку — ровно один ответ", `answers.W1-T1: commits — коммиты из ${base}..head`, "answers.W1-T2: спор — только о блокирующей находке и с правилом"]);
    writeFileSync(join(l.work, "x.txt"), "x");
    await sh(l.work, "git", ["add", "-A"]);
    await sh(l.work, "git", ["commit", "-q", "-m", "local"]);
    out(fb, { status: "done", head: await head(l), answers: [{ id: "W1-T1", action: "disputed", note: "CONVENTIONS §2" }, { id: "W1-T2", action: "disputed", note: "LG-23" }] });
    expect((await dl(l, "answer")).errors).toEqual([`head: не запушен в origin/${BRANCH}`]);
  });

  it("refuses a blocking kind without a rule and a kind outside the protocol", async () => {
    const l = await loop();
    const w = await dl(l, "wave", "--worktree", l.work);
    const std = agents(w).find((a) => a.agent === "reviewer-standards")!.brief;
    const h = await head(l);
    for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: h, summary: "checked", statuses: [], findings: [] });
    out(std, { axis: "standards", head: h, summary: "x", statuses: [], findings: [{ ...BLOCK, kind: "untested", rule: "" }, { ...BLOCK, kind: "block" }] });
    expect(((await dl(l, "merge")).errors as { [agent: string]: string[] })["reviewer-standards"]).toEqual([
      "findings[0]: kind untested блокирует — нужны rule и quote; без них это advice",
      "findings[1].kind: rule | scope | untested | expectation | mechanism | advice",
    ]);
  });
});

describe.concurrent("dev-loop, nothing is lost before the end", { timeout: 30_000 }, () => {
  it("accepts in tidy an advice fixed by a commit before the reviewed head", async () => {
    const l = await loop();
    expect(await round(l, [{ ...BLOCK, kind: "advice", rule: "" }])).toMatchObject({ next: "tidy" });
    const tb = (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "tidy")).brief as string;
    const task = await sh(l.work, "git", ["log", "-1", "--format=%H", "HEAD"]);
    out(tb, { status: "done", head: await head(l), answers: [{ id: "W1-T1", action: "fixed", commits: [task] }] });
    expect(await dl(l, "answer", "--job", "tidy")).toMatchObject({ ok: true, status: "done" });
  });

  it("does not stop on a rule of main the branch rewrote and lists it for the owner in the final report", async () => {
    const l = await loop({ "CONVENTIONS.md": "# C\n\n- two rule\n- own rule\n- one rule, except configs\n" }, { "CONVENTIONS.md": "# C\n\n- one rule\n- two rule\n" });
    expect(await round(l, [])).toMatchObject({ ok: true, wave: 1, next: "done" });
    const fin = readFileSync((await dl(l, "final", "--worktree", l.work)).comment as string, "utf8");
    expect(fin.match(/^- строка CONVENTIONS\.md .*$/gm)).toEqual(["- строка CONVENTIONS.md из main изменена или убрана: «- one rule»"]);
  });

  it("sends advice to a tidy round that records what is deferred in the plan", async () => {
    const l = await loop();
    const advice = { ...BLOCK, kind: "advice", rule: "", text: "a fixture would show the path" };
    expect(await round(l, [advice])).toMatchObject({ next: "tidy" });
    const tb = (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "tidy")).brief as string;
    expect(read(tb)).toMatchObject({ job: "tidy", findings: [], advice: [{ id: "W1-T1" }] });
    out(tb, { status: "done", head: await head(l), answers: [{ id: "W1-T1", action: "deferred", where: "plan/phases/S0/tasks/S0-98-x.md" }] });
    expect((await dl(l, "answer", "--job", "tidy")).errors).toEqual(["answers.W1-T1: where — файл задачи или PLAN.md фазы, изменённый в этом ответе"]);
    const rec = await commit(l.work, { "plan/phases/S0/tasks/S0-98-x.md": "# S0-98\n\n- [ ] a fixture shows the path\n" }, "S0-99: review — defer the fixture to S0-98");
    out(tb, { status: "done", head: rec, answers: [{ id: "W1-T1", action: "deferred", where: "plan/phases/S0/tasks/S0-98-x.md", note: "S0-98" }] });
    expect(await dl(l, "answer", "--job", "tidy")).toMatchObject({ ok: true, status: "done" });
    const w2 = await dl(l, "wave", "--worktree", l.work);
    for (const a of agents(w2)) out(a.brief, { axis: read(a.brief).axis, head: rec, summary: "checked", statuses: [], findings: [] });
    expect(await dl(l, "merge")).toMatchObject({ ok: true, next: "done" });
    expect(readFileSync((await dl(l, "final", "--worktree", l.work)).comment as string, "utf8")).toContain("→ `plan/phases/S0/tasks/S0-98-x.md`");
  });
});
