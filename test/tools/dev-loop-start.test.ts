// dev-loop start opens or resumes a loop in one step (plan/dev-loop.md): it finds the PR of the task or, for a new
// task, opens it — a branch from main, the commit «S0-NN: start», a draft PR (S0-51) — adds or checks the worktree
// and says where to go next. It also brings the owner's checkout to a fresh main
// when that loses nothing. GitHub is a fake gh that answers from a file.
// The checkout and its origin are built once and copied for each case; the cases run concurrently (S0-40).
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
let temp = "";
type Json = { [key: string]: unknown };
type Repo = { root: string; work: string; github: string };

function exec(cwd: string, cmd: string, args: string[], env = process.env): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, encoding: "utf8", env }, (error, stdout, stderr) => resolve({ ok: error === null, stdout, stderr }));
  });
}

async function sh(cwd: string, args: string[]): Promise<string> {
  const r = await exec(cwd, "git", args);
  if (!r.ok) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// main on origin moves one commit ahead of the checkout, as after a merge of a PR.
async function advance(root: string): Promise<void> {
  const other = join(root, "other");
  await sh(root, ["clone", "-q", "--template=", "-b", "main", join(root, "origin.git"), other]);
  for (const args of [["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(other, args);
  await writeFile(join(other, "b.txt"), "b\n");
  await sh(other, ["add", "-A"]);
  await sh(other, ["commit", "-q", "-m", "merged"]);
  await sh(other, ["push", "-q", "origin", "main"]);
}

// A checkout with an origin whose main and branch s0-99-x exist, the file of task S0-98 on main, and the fake gh;
// with ahead, main on origin is one commit ahead of the checkout, as after a merge of a PR. The fake gh keeps
// a PR it creates in its file, so that a later list finds it.
async function build(ahead: boolean): Promise<string> {
  const root = await mkdtemp(join(temp, "base-"));
  const work = join(root, "checkout");
  await mkdir(work);
  // --template= leaves out the sample hooks: a repository without them copies several times faster.
  await sh(root, ["init", "-q", "--template=", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "--template=", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, args);
  await writeFile(join(work, "a.txt"), "a\n");
  await mkdir(join(work, "plan/phases/S0-x/tasks"), { recursive: true });
  await writeFile(join(work, "plan/phases/S0-x/tasks/S0-98-new-thing.md"), "---\nid: S0-98\ntitle: New thing\nphase: S0\n---\n");
  await sh(work, ["add", "-A"]);
  await sh(work, ["commit", "-q", "-m", "base"]);
  await sh(work, ["push", "-q", "origin", "HEAD:refs/heads/main", "HEAD:refs/heads/s0-99-x"]);
  await writeFile(join(root, "gh.mjs"), [
    'import { readFileSync, writeFileSync } from "node:fs";',
    "const data = JSON.parse(readFileSync(process.env.FAKE_GITHUB, \"utf8\"));",
    "const args = process.argv.slice(2);",
    "const flag = (name) => args[args.indexOf(name) + 1];",
    'if (args[1] === "create") {',
    '  data.list.push({ number: 77, title: flag("--title"), headRefName: flag("--head"), isDraft: args.includes("--draft"), body: flag("--body") });',
    "  writeFileSync(process.env.FAKE_GITHUB, JSON.stringify(data));",
    '  console.log("https://example.test/pull/77");',
    "  process.exit(0);",
    "}",
    'const json = args[args.indexOf("--json") + 1];',
    'const merged = args[args.indexOf("--state") + 1] === "merged";',
    'console.log(JSON.stringify(merged ? data.merged ?? [] : args[1] === "list" ? data.list : json === "comments" ? { comments: data.comments } : data.list[0]));',
  ].join("\n"));
  if (ahead) await advance(root);
  return root;
}

// The built checkout of each kind: a case copies it rather than builds it again.
const built = new Map<boolean, Promise<string>>();

// A copy of the built checkout, its origin moved with it; github holds what the fake gh answers.
async function repo({ ahead = false } = {}): Promise<Repo> {
  let source = built.get(ahead);
  if (source === undefined) {
    source = build(ahead);
    built.set(ahead, source);
  }
  const root = await mkdtemp(join(temp, "case-"));
  await cp(await source, root, { recursive: true });
  const work = join(root, "checkout");
  await sh(work, ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { root, work, github: join(root, "github.json") };
}

async function start(r: Repo, github: Json, ...args: string[]): Promise<Json> {
  writeFileSync(r.github, JSON.stringify(github));
  const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github };
  const run = await exec(r.work, process.execPath, [tool, "start", ...args, "--root", join(r.root, "loops")], env);
  return JSON.parse(run.stdout) as Json;
}

const PR = { number: 12, title: "S0-99 · Something", headRefName: "s0-99-x", isDraft: false };

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), "dev-loop-start-"));
});

afterAll(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe.concurrent("dev-loop start", { timeout: 30_000 }, () => {
  it("opens a new task: a branch from main, the start commit and a draft PR; the executor next, its brief with them", async () => {
    const r = await repo();
    const s = await start(r, { list: [], comments: [] }, "--task", "S0-98");
    expect(s).toMatchObject({ ok: true, task: "S0-98", pr: 77, branch: "s0-98-new-thing", created: true, interrupted: false, opened: true, entry: "none", next: "executor" });
    const github = JSON.parse(readFileSync(r.github, "utf8")) as { list: Json[] };
    expect(github.list).toEqual([expect.objectContaining({ title: "S0-98 · New thing", headRefName: "s0-98-new-thing", isDraft: true })]);
    const work = s.work as string;
    expect((await sh(work, ["ls-remote", "origin", "refs/heads/s0-98-new-thing"])).split("\t")[0]).toBe(await sh(work, ["rev-parse", "HEAD"]));
    expect(await sh(work, ["log", "-1", "--format=%s"])).toBe("S0-98: start");
    expect(await sh(work, ["rev-parse", "HEAD^"])).toBe(await sh(work, ["rev-parse", "origin/main"]));
    const brief = await exec(r.work, process.execPath, [tool, "brief", "executor", "--task", "S0-98", "--worktree", work, "--dir", s.dir as string]);
    expect(JSON.parse(readFileSync((JSON.parse(brief.stdout) as Json).brief as string, "utf8"))).toMatchObject({ pr: 77, branch: "s0-98-new-thing" });
    expect(await start(r, github, "--task", "S0-98")).toMatchObject({ pr: 77, created: false, interrupted: false, opened: false, next: "executor" });
    writeFileSync(join(work, "half.txt"), "x");
    expect(await start(r, github, "--task", "S0-98")).toMatchObject({ created: false, interrupted: true, opened: false });
  });

  it("keeps the gaps of the executor when init meets the state start wrote", async () => {
    const r = await repo();
    const s = await start(r, { list: [], comments: [] }, "--task", "S0-98");
    const out = join(s.dir as string, "executor.out.json");
    writeFileSync(out, JSON.stringify({ status: "ready", pr: 77, branch: "s0-98-new-thing", gaps: ["G-99"] }));
    const init = await exec(r.work, process.execPath, [tool, "init", "--task", "S0-98", "--from", out, "--dir", s.dir as string]);
    expect(JSON.parse(init.stdout)).toMatchObject({ ok: true, existed: true });
    expect(JSON.parse(readFileSync(join(s.dir as string, "state.json"), "utf8"))).toMatchObject({ pr: 77, branch: "s0-98-new-thing", gaps: ["G-99"] });
  });

  it("refuses to open a task without its file on main", async () => {
    const r = await repo();
    expect(await start(r, { list: [], comments: [] }, "--task", "S0-97")).toMatchObject({ ok: false, error: "нет файла задачи S0-97 в plan/phases/*/tasks на origin/main" });
  });

  it("resumes a ready PR without comments of the loop at the gate, with its state", async () => {
    const r = await repo();
    const s = await start(r, { list: [PR], comments: [{ body: "looks good" }] }, "--task", "S0-99");
    expect(s).toMatchObject({ pr: 12, branch: "s0-99-x", entry: "none", next: "gate" });
  });

  it("resumes a PR from the header of its last comment of the loop", async () => {
    const r = await repo();
    const state = { pr: 12, task: "S0-99", branch: "s0-99-x", budget: 3, wave: 1, head: null, base: null, waves: [], findings: [], answers: null, decisions: [], gaps: [], triggers: null, pending: null, owner: null, tidied: false, stopped: false };
    const body = `<!-- dev-loop ${JSON.stringify({ kind: "review", state })} -->\n## Ревью`;
    expect(await start(r, { list: [PR], comments: [{ body }] }, "--pr", "12")).toMatchObject({ task: "S0-99", entry: "review", next: "done" });
  });
});

const none = { list: [], comments: [] };

describe.concurrent("dev-loop start, the owner's checkout brought to main", { timeout: 30_000 }, () => {
  it("fast-forwards a clean checkout on main to origin/main", async () => {
    const r = await repo({ ahead: true });
    expect(await start(r, none, "--task", "S0-98")).toMatchObject({ copy: { branch: "main", synced: true, behind: 0 } });
    expect(await sh(r.work, ["rev-parse", "HEAD"])).toBe(await sh(r.work, ["rev-parse", "origin/main"]));
  });

  it("moves a clean checkout from a branch whose PR is merged to a fresh main", async () => {
    const r = await repo({ ahead: true });
    await sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    expect(await start(r, { ...none, merged: [{ number: 12 }] }, "--task", "S0-98")).toMatchObject({ copy: { branch: "main", synced: true, from: "s0-99-x" } });
    expect(await sh(r.work, ["branch", "--show-current"])).toBe("main");
    expect(await sh(r.work, ["rev-parse", "HEAD"])).toBe(await sh(r.work, ["rev-parse", "origin/main"]));
  });
});

describe.concurrent("dev-loop start, the owner's checkout left as it is", { timeout: 30_000 }, () => {
  it("leaves a branch whose PR is not merged, and says how far main is", async () => {
    const r = await repo({ ahead: true });
    await sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    expect(await start(r, none, "--task", "S0-98")).toMatchObject({ copy: { branch: "s0-99-x", synced: false, behind: 1 } });
    expect(await sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a branch with commits outside origin/main, even if its PR is merged", async () => {
    const r = await repo({ ahead: true });
    await sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    writeFileSync(join(r.work, "c.txt"), "c\n");
    await sh(r.work, ["add", "-A"]);
    await sh(r.work, ["commit", "-q", "-m", "after merge"]);
    expect(await start(r, { ...none, merged: [{ number: 12 }] }, "--task", "S0-98")).toMatchObject({ copy: { branch: "s0-99-x", synced: false } });
    expect(await sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a checkout with changes untouched", async () => {
    const r = await repo({ ahead: true });
    writeFileSync(join(r.work, "a.txt"), "changed\n");
    const s = await start(r, none, "--task", "S0-98");
    expect(s).toMatchObject({ ok: true, copy: { branch: "main", synced: false, behind: 1 } });
    expect((s.copy as Json).why).toEqual(expect.any(String));
    expect(await sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });

  it("does not touch the checkout when start runs from a linked worktree", async () => {
    const r = await repo({ ahead: true });
    const linked = join(r.root, "linked");
    await sh(r.work, ["worktree", "add", "-q", "--detach", linked, "main"]);
    writeFileSync(r.github, JSON.stringify(none));
    const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github };
    const run = await exec(linked, process.execPath, [tool, "start", "--task", "S0-98", "--root", join(r.root, "loops")], env);
    expect(JSON.parse(run.stdout)).toMatchObject({ copy: { synced: false } });
    expect(await sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });
});
