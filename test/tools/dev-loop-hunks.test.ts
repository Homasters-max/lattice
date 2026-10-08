// Review by hunks (S0-45): the review of an axis is evidence keyed by (axis, hunk). A round reviews only the hunks
// its axis has not reviewed, with the axes whose triggers they touch; the verifier gives the answered findings their
// status. The axes that start with the gate keep their review of the hunks the fix of a red gate did not touch, and the
// round of the hunks it touched costs no budget; a round counts its hunks once whatever the axes; a finding
// in a hunk the round gave its axis blocks, one outside the delta and those hunks is late. The answer to a round with
// blocking findings decides its advice too, and may defer a late finding and the owner's decisions task and gap. Each case runs dl on a throwaway repository with an origin,
// built once and copied for each case; the cases run concurrently (S0-40).
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
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

async function sh(cwd: string, cmd: Program, args: string[], env = process.env): Promise<string> {
  const ran = await cmd.start(args, { cwd, env });
  if (ran.status !== 0 && cmd === git) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

// Commits the files and pushes the branch, as an agent does before it answers.
async function commit(work: string, files: Files, message: string): Promise<string> {
  for (const [path, text] of Object.entries(files)) temp.write(join(work, path), text);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", message]);
  await sh(work, git, ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, git, ["rev-parse", "HEAD"]);
}

const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;

const TASK: Files = { "src/ledger/land.ts": land(2) };
// The items findings and disputes name (CONVENTIONS §N.M); a case may give main its own.
const CONVENTIONS = "# C\n\n## 1. A\n\n### §1.1 One\nОбласть: `src/**`\n\n## 2. B\n\n### §2.1 Two\nОбласть: `src/**`\n";
const NO_MAIN: Files = {};

// A work tree with an origin whose main is the base and the main files, a branch with one change, and an initialised loop.
// Steps that do not depend on each other run together: the build is on the path of every case.
async function build(change: Files, main: Files): Promise<string> {
  const root = folder("base-");
  const work = join(root, "work");
  for (const [path, text] of Object.entries({ "src/ledger/land.ts": land(1), "CONVENTIONS.md": CONVENTIONS, ...main })) temp.write(join(work, path), text);
  // --template= leaves out the sample hooks: a repository without them copies several times faster.
  const origin = sh(root, git, ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template="], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, git, args);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "base"]);
  await origin;
  // The push also sets origin/main and origin/<branch> of the work tree, as a fetch would.
  await sh(work, git, ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
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
  const root = folder("case-");
  temp.copy(await source, root);
  const work = join(root, "work");
  await sh(work, git, ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { work, dir: join(root, "loop") };
}

async function dl(l: Loop, ...args: string[]): Promise<Json> {
  return JSON.parse(await sh(l.work, tool, [...args, ...(args[0] === "check" ? [] : ["--dir", l.dir])], { ...process.env, DEV_LOOP_GH: gh })) as Json;
}

const read = (file: string): Json => JSON.parse(temp.text(file)) as Json;
const agents = (r: Json) => r.agents as { agent: string; brief: string }[];
const out = (brief: string, value: Json) => temp.write(brief.replace(".in.json", ".out.json"), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, git, ["rev-parse", "HEAD"]);
const BLOCK = { kind: "rule", rule: "CONVENTIONS §1.1", where: "src/ledger/land.ts:2", quote: "return 2;", text: "magic number; use the constant" };
const fixerBrief = async (l: Loop) => (await dl(l, "brief", "fixer", "--worktree", l.work, "--job", "answer")).brief as string;

async function round(l: Loop, findings: Json[]): Promise<Json> {
  const w = await dl(l, "wave", "--worktree", l.work);
  const h = await head(l);
  for (const a of agents(w)) out(a.brief, { axis: read(a.brief).axis, head: h, summary: "checked", statuses: [], findings: a.agent === "reviewer-standards" ? findings : [] });
  return dl(l, "merge");
}

beforeAll(() => {
  temp = scratch("dev-loop-hunks-");
  gh = temp.write("gh.mjs", 'console.log(JSON.stringify({ body: "PR body" }));\n');
});

afterAll(() => {
  temp.remove();
});

const LIFT = "export function lift(): number {\n  return 1;\n}\n";
// Two hunks: the body of land (Spec, Standards) and a new file with an export (and Architecture).
const TWO: Files = { "src/ledger/land.ts": land(2), "src/ledger/lift.ts": LIFT };
type Brief = Json & { hunks?: string[]; context: { hunks?: { file: string; at: string; reasons: string[] }[] } };
const briefOf = (r: Json, agent: string) => read(agents(r).find((a) => a.agent === agent)!.brief) as Brief;
const shownHunks = (b: Brief) => b.context.hunks!.map((h) => `${h.file}:${h.at}`);
// The axes that reviewed each hunk of the head, by their letters.
const reviewedBy = (l: Loop) => Object.values(read(join(l.dir, "state.json")).reviewedBy as { [id: string]: string }).sort();

// The fixer answers W1-T1 by a commit of the files; then the next round.
async function fixAndWave(l: Loop, files: Files): Promise<{ fix: string; w: Json }> {
  const fb = await fixerBrief(l);
  const fix = await commit(l.work, files, "S0-99: review — constant");
  out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }] });
  expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
  return { fix, w: await dl(l, "wave", "--worktree", l.work) };
}

// Every agent of the round answers on the head; the verifier closes the findings it got.
async function closeAll(l: Loop, w: Json, h: string): Promise<Json> {
  for (const a of agents(w)) {
    const b = read(a.brief) as Json & { findings: { id: string }[] };
    out(a.brief, { axis: b.axis, head: h, summary: "checked", statuses: b.findings.map((f) => ({ id: f.id, status: "closed" })), findings: [] });
  }
  return dl(l, "merge");
}

// Round 1 starts Standards and Architecture with the gate; the fix of the red gate edits the hunk of land.ts, and the
// rest of the round reviews on its head. → that head: the round after it has the same head and the hunk of land.ts to
// review with Standards.
async function redGate(l: Loop): Promise<string> {
  const early = await dl(l, "wave", "--worktree", l.work, "--early");
  const h1 = await head(l);
  for (const a of agents(early)) out(a.brief, { axis: read(a.brief).axis, head: h1, summary: "checked", statuses: [], findings: [] });
  const h2 = await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: verify — red");
  expect(await closeAll(l, await dl(l, "wave", "--worktree", l.work), h2)).toMatchObject({ ok: true, wave: 1, next: "wave" });
  return h2;
}

// The record in the plan a deferred answer names.
const TASK_RECORD = "plan/phases/S0/tasks/S0-98-x.md";

describe.concurrent("dev-loop, review by hunks", { timeout: 60_000 }, () => {
  it("reviews in the next round only the edited hunk and only with the axes of its triggers; the review of the other hunks holds", async () => {
    const l = await loop(TWO);
    expect(await round(l, [BLOCK])).toMatchObject({ next: "fix" });
    expect(reviewedBy(l)).toEqual(["AST", "ST"]);
    // The round counts its hunks, not the hunks of each axis.
    expect((read(join(l.dir, "state.json")).waves as { hunks: number }[])[0]!.hunks).toBe(2);
    const { fix, w } = await fixAndWave(l, { "src/ledger/land.ts": land(3) });
    expect(agents(w).map((a) => a.agent)).toEqual(["reviewer-spec", "reviewer-standards", "verifier"]);
    for (const agent of ["reviewer-spec", "reviewer-standards"]) {
      expect(shownHunks(briefOf(w, agent))).toEqual(["src/ledger/land.ts:2"]);
      expect(briefOf(w, agent).hunks).toHaveLength(1);
    }
    expect(await closeAll(l, w, fix)).toMatchObject({ ok: true, next: "done" });
    expect(reviewedBy(l)).toEqual(["AST", "ST"]);
  });

  it("does not call Architecture for a delta without its triggers, and calls it for a new export, with that hunk alone", async () => {
    const l = await loop(TWO);
    await round(l, [BLOCK]);
    const { w } = await fixAndWave(l, { "src/ledger/land.ts": `${land(3)}export const LAND = 3;\n` });
    expect(agents(w).map((a) => a.agent)).toEqual(["reviewer-spec", "reviewer-standards", "reviewer-architecture", "verifier"]);
    expect(shownHunks(briefOf(w, "reviewer-standards"))).toEqual(["src/ledger/land.ts:2", "src/ledger/land.ts:4"]);
    const arch = briefOf(w, "reviewer-architecture");
    expect(arch.context.hunks).toEqual([expect.objectContaining({ file: "src/ledger/land.ts", at: "4", reasons: ["новый или изменённый экспорт (опись closure-check)"] })]);
    expect(arch.reasons).toEqual(["новый или изменённый экспорт (опись closure-check)"]);
  });
});

describe.concurrent("dev-loop, a round that starts with the gate", { timeout: 60_000 }, () => {
  it("keeps after a red gate the review of the axes started with it on the hunks its fix did not touch", async () => {
    const l = await loop(TWO);
    const early = await dl(l, "wave", "--worktree", l.work, "--early");
    expect(early).toMatchObject({ ok: true, wave: 1, next: "gate" });
    expect(agents(early).map((a) => a.agent)).toEqual(["reviewer-standards", "reviewer-architecture"]);
    const h1 = await head(l);
    for (const a of agents(early)) out(a.brief, { axis: read(a.brief).axis, head: h1, summary: "checked", statuses: [], findings: [] });
    expect(await dl(l, "wave", "--worktree", l.work, "--early")).toMatchObject({ ok: true, wave: 1, agents: [], next: "gate" });
    // The gate is red, and the fixer of the red edits the hunk of land.ts.
    const h2 = await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: verify — red");
    const rest = await dl(l, "wave", "--worktree", l.work);
    expect(rest).toMatchObject({ ok: true, wave: 1, started: ["reviewer-architecture", "reviewer-standards"], next: "review" });
    expect(agents(rest).map((a) => a.agent)).toEqual(["reviewer-spec"]);
    expect(await closeAll(l, rest, h2)).toMatchObject({ ok: true, wave: 1, next: "wave" });
    // lift.ts keeps the review of Architecture and Standards from before the red gate; land.ts has Spec's alone.
    expect(reviewedBy(l)).toEqual(["AST", "S"]);
    // The round of land.ts the red gate left does not count against the budget, as the red gate does not.
    expect(read(join(l.dir, "state.json")).budget).toBe(4);
    const w2 = await dl(l, "wave", "--worktree", l.work);
    expect(agents(w2).map((a) => a.agent)).toEqual(["reviewer-standards"]);
    expect(shownHunks(briefOf(w2, "reviewer-standards"))).toEqual(["src/ledger/land.ts:2"]);
    expect(await closeAll(l, w2, h2)).toMatchObject({ ok: true, wave: 2, next: "done" });
  });

  it("starts Spec with the gate only when the report of prove --ready is on the head and without edits", async () => {
    const early = async (report: (head: string) => Json) => {
      const l = await loop(TWO);
      temp.write(join(l.work, ".lattice", "mutants.json"), JSON.stringify({ base: "x", mutants: [], ...report(await head(l)) }));
      return agents(await dl(l, "wave", "--worktree", l.work, "--early")).map((a) => a.agent);
    };
    const [ready, dirty, other, headless] = await Promise.all([
      early((h) => ({ head: h, dirty: false })),
      early((h) => ({ head: h, dirty: true })),
      early(() => ({ head: "0".repeat(40), dirty: false })),
      early(() => ({ dirty: false })),
    ]);
    expect(ready).toEqual(["reviewer-spec", "reviewer-standards", "reviewer-architecture"]);
    for (const without of [dirty, other, headless]) expect(without).toEqual(["reviewer-standards", "reviewer-architecture"]);
  });
});

describe.concurrent("dev-loop, a finding outside the hunks of its axis", { timeout: 60_000 }, () => {
  it("blocks by a finding in a hunk the round gave its axis on the head of the last round; a finding outside it is late, and the answer defers it", async () => {
    const l = await loop(TWO);
    const h2 = await redGate(l);
    const w2 = await dl(l, "wave", "--worktree", l.work);
    expect(agents(w2).map((a) => a.agent)).toEqual(["reviewer-standards"]);
    const outside = { ...BLOCK, rule: "CONVENTIONS §2.1", where: "src/ledger/lift.ts:2", quote: "return 1;" };
    out(agents(w2)[0]!.brief, { axis: "standards", head: h2, summary: "checked", statuses: [], findings: [{ ...BLOCK, quote: "return 3;" }, outside] });
    expect(await dl(l, "merge")).toMatchObject({ ok: true, wave: 2, next: "fix", open: ["W2-T1", "W2-T2"] });
    const findings = read(join(l.dir, "state.json")).findings as { id: string; late: boolean }[];
    expect(findings.map((f) => [f.id, f.late])).toEqual([["W2-T1", false], ["W2-T2", true]]);
    const fb = await fixerBrief(l);
    const fix = await commit(l.work, { "src/ledger/land.ts": land(4), [TASK_RECORD]: "# S0-98\n\n- [ ] lift by the constant\n" }, "S0-99: review — constant; lift deferred to S0-98");
    out(fb, { status: "done", head: fix, answers: [{ id: "W2-T1", action: "fixed", commits: [fix] }, { id: "W2-T2", action: "deferred", where: TASK_RECORD, note: "S0-98" }] });
    expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
  });
});

describe.concurrent("dev-loop, advice of a round with blocking findings", { timeout: 60_000 }, () => {
  it("gives the answer the finding and the advice, refuses an answer that leaves the advice, and has no tidy round after it", async () => {
    const l = await loop();
    const advice = { ...BLOCK, kind: "advice", rule: "", where: "src/ledger/land.ts:1", text: "name the function after the rule" };
    expect(await round(l, [BLOCK, advice])).toMatchObject({ next: "fix", open: ["W1-T1"] });
    const fb = await fixerBrief(l);
    expect(read(fb)).toMatchObject({ job: "answer", findings: [{ id: "W1-T1" }], advice: [{ id: "W1-T2" }] });
    const fix = await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: review — constant");
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "deferred", where: "plan/phases/S0/PLAN.md" }] });
    expect((await dl(l, "answer")).errors).toEqual([
      "answers: нет ответа на W1-T2",
      "answers.W1-T1: отложить можно совет, находку вне дельты или решение владельца task и gap — блокирующую находку исправляют или оспаривают",
      "answers.W1-T1: where — файл задачи или PLAN.md фазы, изменённый в этом ответе",
    ]);
    out(fb, { status: "done", head: fix, answers: [{ id: "W1-T1", action: "fixed", commits: [fix] }, { id: "W1-T2", action: "declined", note: "the name is the one of the glossary" }] });
    expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
    expect(await closeAll(l, await dl(l, "wave", "--worktree", l.work), fix)).toMatchObject({ ok: true, wave: 2, next: "done" });
    expect(temp.text((await dl(l, "final", "--worktree", l.work)).comment as string)).toContain("- W1-T2 · `src/ledger/land.ts:1`: name the function after the rule — the name is the one of the glossary");
  });

  it("sends the advice of a round without blocking findings to a tidy round", async () => {
    const l = await loop();
    expect(await round(l, [{ ...BLOCK, kind: "advice", rule: "" }])).toMatchObject({ next: "tidy" });
  });

  it("lets the answer defer the owner's decisions task and gap by a record in the plan", async () => {
    const l = await loop();
    const other = { ...BLOCK, rule: "CONVENTIONS §2.1", where: "src/ledger/land.ts:1", quote: "export function land(): number {" };
    expect(await round(l, [BLOCK, other])).toMatchObject({ next: "fix", open: ["W1-T1", "W1-T2"] });
    await dl(l, "escalate", "--why", "проверить");
    temp.write(join(l.dir, "a.json"), JSON.stringify({ "W1-T1": { action: "task", note: "a task for the constant" }, "W1-T2": { action: "gap", note: "a gap of the phase" } }));
    expect(await dl(l, "owner", "--answers", join(l.dir, "a.json"))).toMatchObject({ ok: true, next: "fix" });
    const fb = await fixerBrief(l);
    expect(read(fb)).toMatchObject({ findings: [], decisions: [{ id: "W1-T1", action: "task" }, { id: "W1-T2", action: "gap" }] });
    const plan = "plan/phases/S0/PLAN.md";
    const rec = await commit(l.work, { [TASK_RECORD]: "# S0-98\n\n- [ ] the constant of land\n", [plan]: "# S0\n\n## 12\n\n- G-01: the name of land\n" }, "S0-99: review — the owner's decisions in the plan");
    out(fb, { status: "done", head: rec, answers: [{ id: "W1-T1", action: "deferred", where: TASK_RECORD, note: "S0-98" }, { id: "W1-T2", action: "deferred", where: plan, note: "G-01" }] });
    expect(await dl(l, "answer")).toMatchObject({ ok: true, status: "done" });
  });
});
