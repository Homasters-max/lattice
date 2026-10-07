// dev-loop drives a review loop through files and one-line JSON (plan/dev-loop.md); these cases run
// the tool on a throwaway repository with an origin: a loop that converges and resumes from its comments,
// a dispute the owner settles, a stop the owner answers, and outputs of agents the protocol refuses.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
const dirs: string[] = [];
const BRANCH = "s0-99-x";
type Json = { [key: string]: unknown };
type Loop = { work: string; dir: string };

function sh(cwd: string, cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0 && cmd === "git") throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// Commits the files and pushes the branch, as an agent does before it answers.
function commit(work: string, files: { [path: string]: string }, message: string): string {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
  }
  sh(work, "git", ["add", "-A"]);
  sh(work, "git", ["commit", "-q", "-m", message]);
  sh(work, "git", ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, "git", ["rev-parse", "HEAD"]);
}

const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;

// A work tree with an origin whose main is the base, a branch with one change of a body, and an initialised loop.
function loop(change: { [path: string]: string } = { "src/ledger/land.ts": land(2) }): Loop {
  const root = mkdtempSync(join(tmpdir(), "dev-loop-flow-"));
  dirs.push(root);
  const work = join(root, "work");
  mkdirSync(work);
  sh(root, "git", ["init", "-q", "--bare", "origin.git"]);
  for (const args of [["init", "-q"], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) sh(work, "git", args);
  commit(work, { "src/ledger/land.ts": land(1) }, "base");
  sh(work, "git", ["push", "-q", "origin", "HEAD:refs/heads/main"]);
  sh(work, "git", ["fetch", "-q", "origin"]);
  commit(work, change, "task");
  const l = { work, dir: join(root, "loop") };
  dl(l, "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
  return l;
}

function dl(l: Loop, ...args: string[]): Json {
  return JSON.parse(sh(l.work, process.execPath, [tool, ...args, ...(args[0] === "check" ? [] : ["--dir", l.dir])])) as Json;
}

const read = (file: string): Json => JSON.parse(readFileSync(file, "utf8")) as Json;
const agents = (r: Json) => r.agents as { agent: string; brief: string }[];
const out = (brief: string, value: Json) => writeFileSync(brief.replace(".in.json", ".out.json"), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, "git", ["rev-parse", "HEAD"]);
const BLOCK = { kind: "rule", rule: "CONVENTIONS §1", where: "src/ledger/land.ts:2", quote: "return 2;", text: "magic number; use the constant" };
const fixerBrief = (l: Loop) => dl(l, "brief", "fixer", "--worktree", l.work, "--job", "answer").brief as string;

function round(l: Loop, findings: Json[]): Json {
  const w = dl(l, "wave", "--worktree", l.work);
  for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: head(l), summary: "checked", statuses: [], findings: a.agent === "reviewer-standards" ? findings : [] });
  return dl(l, "merge");
}

function comments(l: Loop): string {
  const d = join(l.dir, "comments");
  const file = join(l.dir, "comments.json");
  writeFileSync(file, JSON.stringify({ comments: readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => ({ body: readFileSync(join(d, f), "utf8") })) }));
  return file;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("dev-loop, a loop that converges", { timeout: 30_000 }, () => {
  it("finds, answers, checks the closure and ends; the comments restore the state", () => {
    const l = loop();
    const m1 = round(l, [BLOCK]);
    expect(m1).toMatchObject({ ok: true, wave: 1, next: "fix", open: ["W1-T1"] });
    expect(readFileSync(m1.comment as string, "utf8")).toMatch(/^<!-- dev-loop \{"kind":"review"[\s\S]*\*\*W1-T1\*\* · блокирует · CONVENTIONS §1/);
    const fb = fixerBrief(l);
    const fix = commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: review — constant");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix], note: "constant" }] });
    expect(dl(l, "answer")).toMatchObject({ ok: true, status: "done", disputed: [] });
    expect(dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "answer", next: "gate" });

    const w2 = dl(l, "wave", "--worktree", l.work);
    expect(w2).toMatchObject({ wave: 2, mode: "verify" });
    expect(agents(w2).map((a) => a.agent)).toEqual(["verifier"]);
    out(agents(w2)[0]!.brief, { axis: "verify", head: fix, summary: "closed", statuses: [{ id: "W1-T1", status: "closed" }], findings: [] });
    expect(dl(l, "merge")).toMatchObject({ ok: true, wave: 2, next: "done", open: [] });
    expect(dl(l, "merge")).toMatchObject({ ok: false, error: "нет круга 3: сначала wave" });

    const fin = dl(l, "final").comment as string;
    expect(readFileSync(fin, "utf8")).toContain("| 2 | проверка закрытия | Проверка закрытия | — | W1-T1 |");
    expect(dl(l, "restore", "--comments", comments(l))).toMatchObject({ ok: true, entry: "final", wave: 2, next: "end" });
  });
});

describe("dev-loop, the owner decides", { timeout: 30_000 }, () => {
  it("escalates a kept dispute and closes the finding by the owner's decision", () => {
    const l = loop();
    round(l, [BLOCK]);
    out(fixerBrief(l), { status: "done", head: head(l), answers: [{ id: "W1-T1", action: "disputed", note: "CONVENTIONS §5 allows it" }] });
    expect(dl(l, "answer")).toMatchObject({ ok: true, disputed: ["W1-T1"] });
    const w2 = dl(l, "wave", "--worktree", l.work);
    expect(agents(w2).map((a) => a.agent)).toEqual(["reviewer-standards"]);
    out(agents(w2)[0]!.brief, { axis: "standards", head: head(l), summary: "kept", statuses: [{ id: "W1-T1", status: "dispute-kept", note: "§1 names it" }], findings: [] });
    expect(dl(l, "merge")).toMatchObject({ next: "escalate" });
    const e = dl(l, "escalate", "--why", "спор");
    expect((read(e.questions as string) as unknown as Json[])[0]).toMatchObject({ header: "W1-T1" });
    expect(dl(l, "restore", "--comments", comments(l))).toMatchObject({ entry: "escalation", next: "ask" });
    writeFileSync(join(l.dir, "a.json"), JSON.stringify({ "W1-T1": { action: "чинить" } }));
    expect(dl(l, "owner", "--answers", join(l.dir, "a.json")).errors).toEqual(["W1-T1.action: fix | drop | task | gap | stop"]);
    writeFileSync(join(l.dir, "a.json"), JSON.stringify({ "W1-T1": { action: "drop", note: "§5 wins" } }));
    expect(dl(l, "owner", "--answers", join(l.dir, "a.json"))).toMatchObject({ ok: true, next: "done" });
  });

  it("stops before review on docs/design and turns the owner's answer into an instruction to the fixer", () => {
    const l = loop({ "docs/design/05-ledger.md": "# Ledger\n" });
    const w = dl(l, "wave", "--worktree", l.work);
    expect(w).toMatchObject({ next: "owner", why: "docs/design изменён без записи в discussion/decisions.md (AGENTS.md)" });
    const e = dl(l, "escalate", "--why", w.why as string);
    expect((read(e.questions as string) as unknown as Json[])[0]).toMatchObject({ header: "Решение" });
    expect(dl(l, "owner", "--text", "запиши решение D-20")).toMatchObject({ ok: true, next: "instruct" });
    expect(read(dl(l, "brief", "fixer", "--worktree", l.work, "--job", "owner").brief as string)).toMatchObject({ job: "owner", owner: "запиши решение D-20" });
    expect(dl(l, "owner", "--text", "x")).toMatchObject({ ok: false, errors: ["владельца ни о чём не спрашивали"] });
  });
});

describe("dev-loop, outputs the protocol refuses", { timeout: 30_000 }, () => {
  it("refuses a reviewer that misses a status, disputes nothing or reviews another head", () => {
    const l = loop();
    round(l, [BLOCK]);
    const fb = fixerBrief(l);
    const fix = commit(l.work, { "src/ledger/land.ts": land(3) }, "fix");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] });
    dl(l, "answer");
    const v = agents(dl(l, "wave", "--worktree", l.work))[0]!.brief;
    out(v, { axis: "verify", head: "", summary: "x", statuses: [{ id: "W1-T1", status: "dispute-kept", note: "n" }], findings: [null] });
    const errors = (dl(l, "merge").errors as { [agent: string]: string[] }).verifier!;
    expect(errors).toEqual([`head: ${fix}`, "findings: список объектов", "statuses.W1-T1: dispute-kept — автор не оспаривал"]);
    out(v, { axis: "verify", head: fix, summary: "x", statuses: [], findings: [] });
    expect(dl(l, "check", v.replace(".in.json", ".out.json")).errors).toEqual(["statuses: нет статуса для W1-T1"]);
  });

  it("refuses an answer twice to one finding, a commit outside the answer, a dispute without a rule and an unpushed head", () => {
    const l = loop();
    round(l, [BLOCK, { ...BLOCK, where: "src/ledger/land.ts:9", text: "other" }]);
    const fb = fixerBrief(l);
    const base = (read(fb).base as string).slice(0, 7);
    out(fb, { status: "done", head: head(l), answers: [{ id: "W1-T1", action: "fixed", commits: [head(l)] }, { id: "W1-T1", action: "disputed", note: "CONVENTIONS §2" }, { id: "W1-T2", action: "disputed", note: "no" }] });
    expect(dl(l, "answer").errors).toEqual(["answers: на находку — ровно один ответ", `answers.W1-T1: commits — коммиты из ${base}..head`, "answers.W1-T2: спор — только о блокирующей находке и с правилом"]);
    writeFileSync(join(l.work, "x.txt"), "x");
    sh(l.work, "git", ["add", "-A"]);
    sh(l.work, "git", ["commit", "-q", "-m", "local"]);
    out(fb, { status: "done", head: head(l), answers: [{ id: "W1-T1", action: "disputed", note: "CONVENTIONS §2" }, { id: "W1-T2", action: "disputed", note: "LG-23" }] });
    expect(dl(l, "answer").errors).toEqual([`head: не запушен в origin/${BRANCH}`]);
  });

  it("refuses a blocking kind without a rule and a kind outside the protocol", () => {
    const l = loop();
    const w = dl(l, "wave", "--worktree", l.work);
    const std = agents(w).find((a) => a.agent === "reviewer-standards")!.brief;
    for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: head(l), summary: "checked", statuses: [], findings: [] });
    out(std, { axis: "standards", head: head(l), summary: "x", statuses: [], findings: [{ ...BLOCK, kind: "untested", rule: "" }, { ...BLOCK, kind: "block" }] });
    expect((dl(l, "merge").errors as { [agent: string]: string[] })["reviewer-standards"]).toEqual([
      "findings[0]: kind untested блокирует — нужны rule и quote; без них это advice",
      "findings[1].kind: rule | scope | untested | expectation | mechanism | advice",
    ]);
  });
});

describe("dev-loop, nothing is lost before the end", { timeout: 30_000 }, () => {
  it("accepts in tidy an advice fixed by a commit before the reviewed head", () => {
    const l = loop();
    expect(round(l, [{ ...BLOCK, kind: "advice", rule: "" }])).toMatchObject({ next: "tidy" });
    const tb = dl(l, "brief", "fixer", "--worktree", l.work, "--job", "tidy").brief as string;
    const task = sh(l.work, "git", ["log", "-1", "--format=%H", "HEAD"]);
    out(tb, { status: "done", head: head(l), answers: [{ id: "W1-T1", action: "fixed", commits: [task] }] });
    expect(dl(l, "answer", "--job", "tidy")).toMatchObject({ ok: true, status: "done" });
  });

  it("sends advice to a tidy round that records what is deferred in the plan", () => {
    const l = loop();
    const advice = { ...BLOCK, kind: "advice", rule: "", text: "a fixture would show the path" };
    expect(round(l, [advice])).toMatchObject({ next: "tidy" });
    const tb = dl(l, "brief", "fixer", "--worktree", l.work, "--job", "tidy").brief as string;
    expect(read(tb)).toMatchObject({ job: "tidy", findings: [], advice: [{ id: "W1-T1" }] });
    out(tb, { status: "done", head: head(l), answers: [{ id: "W1-T1", action: "deferred", where: "plan/phases/S0/tasks/S0-98-x.md" }] });
    expect(dl(l, "answer", "--job", "tidy").errors).toEqual(["answers.W1-T1: where — файл задачи или PLAN.md фазы, изменённый в этом ответе"]);
    const rec = commit(l.work, { "plan/phases/S0/tasks/S0-98-x.md": "# S0-98\n\n- [ ] a fixture shows the path\n" }, "S0-99: review — defer the fixture to S0-98");
    out(tb, { status: "done", head: rec, answers: [{ id: "W1-T1", action: "deferred", where: "plan/phases/S0/tasks/S0-98-x.md", note: "S0-98" }] });
    expect(dl(l, "answer", "--job", "tidy")).toMatchObject({ ok: true, status: "done" });
    const w2 = dl(l, "wave", "--worktree", l.work);
    for (const a of agents(w2)) out(a.brief, { axis: read(a.brief).axis, head: rec, summary: "checked", statuses: [], findings: [] });
    expect(dl(l, "merge")).toMatchObject({ ok: true, next: "done" });
    expect(readFileSync(dl(l, "final").comment as string, "utf8")).toContain("→ `plan/phases/S0/tasks/S0-98-x.md`");
  });
});
