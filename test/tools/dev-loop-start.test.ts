// dev-loop start opens or resumes a loop in one step (plan/dev-loop.md): it finds the PR of the task or, for a new
// task, opens it — a branch from main, the commit «S0-NN: start», a draft PR (S0-51) — adds or checks the worktree
// and says where to go next. It also brings the owner's checkout to a fresh main
// when that loses nothing. GitHub is a fake gh that answers from a file.
// The checkout and its origin are built once and copied for each case; the cases run concurrently (S0-40).
// A case runs several dl commands and git on its copy; under the full run, beside the cases of review by hunks (S0-45),
// one went past 30 s, so it waits 60 s, as those of the clock and the flow.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { NO_MAINTENANCE } from "../support/git.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
let temp: Scratch;
let folders = 0;
type Json = { [key: string]: unknown };
type Repo = { root: string; work: string; github: string };

async function exec(cwd: string, cmd: Program, args: readonly string[], env = process.env): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const ran = await cmd.start(args, { cwd, env });
  return { ok: ran.status === 0, stdout: ran.stdout, stderr: ran.stderr };
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

async function sh(cwd: string, args: readonly string[]): Promise<string> {
  const r = await exec(cwd, git, args);
  if (!r.ok) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// main on origin moves one commit ahead of the checkout, as after a merge of a PR; the commit adds these files.
async function advance(root: string, files: { [path: string]: string } = { "b.txt": "b\n" }): Promise<void> {
  const other = join(root, "other");
  await sh(root, ["clone", "-q", "--template=", "-b", "main", join(root, "origin.git"), other]);
  for (const args of [NO_MAINTENANCE, ["config", "user.email", "t@t"], ["config", "user.name", "t"]]) await sh(other, args);
  for (const [path, text] of Object.entries(files)) temp.write(join(other, path), text);
  await sh(other, ["add", "-A"]);
  await sh(other, ["commit", "-q", "-m", "merged"]);
  await sh(other, ["push", "-q", "origin", "main"]);
}

// A checkout with an origin whose main and branch s0-99-x exist, the file of task S0-98 on main, and the fake gh;
// with ahead, main on origin is one commit ahead of the checkout, as after a merge of a PR. The fake gh keeps
// a PR it creates in its file, so that a later list finds it.
async function build(ahead: boolean): Promise<string> {
  const root = folder("base-");
  const work = join(root, "checkout");
  temp.mkdir(work);
  // --template= leaves out the sample hooks: a repository without them copies several times faster.
  await sh(root, ["init", "-q", "--template=", "--bare", "origin.git"]);
  await sh(join(root, "origin.git"), NO_MAINTENANCE);
  for (const args of [["init", "-q", "--template=", "-b", "main"], NO_MAINTENANCE, ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, args);
  temp.write(join(work, "a.txt"), "a\n");
  // The records of runs (S0-43) are in .lattice/, which git ignores: a checkout with them is clean.
  temp.write(join(work, ".gitignore"), ".lattice/\n");
  temp.write(join(work, "plan/phases/S0-x/tasks/S0-98-new-thing.md"), "---\nid: S0-98\ntitle: New thing\nphase: S0\n---\n");
  await sh(work, ["add", "-A"]);
  await sh(work, ["commit", "-q", "-m", "base"]);
  await sh(work, ["push", "-q", "origin", "HEAD:refs/heads/main", "HEAD:refs/heads/s0-99-x"]);
  temp.write(join(root, "gh.mjs"), [
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
  const root = folder("case-");
  temp.copy(await source, root);
  const work = join(root, "checkout");
  await sh(work, ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { root, work, github: join(root, "github.json") };
}

const NOW = "2026-10-08T10:00:00.000Z";

async function start(r: Repo, github: Json, ...args: string[]): Promise<Json> {
  temp.write(r.github, JSON.stringify(github));
  const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github, DEV_LOOP_NOW: NOW };
  const run = await exec(r.work, tool, ["start", ...args, "--root", join(r.root, "loops")], env);
  return JSON.parse(run.stdout) as Json;
}

const PR = { number: 12, title: "S0-99 · Something", headRefName: "s0-99-x", isDraft: false };

beforeAll(() => {
  temp = scratch("dev-loop-start-");
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop start", { timeout: 60_000 }, () => {
  it("opens a new task: a branch from main, the start commit and a draft PR; the executor next, its brief with them", async () => {
    const r = await repo();
    const s = await start(r, { list: [], comments: [] }, "--task", "S0-98");
    expect(s).toMatchObject({ ok: true, task: "S0-98", pr: 77, branch: "s0-98-new-thing", created: true, interrupted: false, opened: true, entry: "none", next: "executor" });
    const github = JSON.parse(temp.text(r.github)) as { list: Json[] };
    expect(github.list).toEqual([expect.objectContaining({ title: "S0-98 · New thing", headRefName: "s0-98-new-thing", isDraft: true })]);
    const work = s.work as string;
    expect((await sh(work, ["ls-remote", "origin", "refs/heads/s0-98-new-thing"])).split("\t")[0]).toBe(await sh(work, ["rev-parse", "HEAD"]));
    expect(await sh(work, ["log", "-1", "--format=%s"])).toBe("S0-98: start");
    expect(await sh(work, ["rev-parse", "HEAD^"])).toBe(await sh(work, ["rev-parse", "origin/main"]));
    const brief = await exec(r.work, tool, ["brief", "executor", "--task", "S0-98", "--worktree", work, "--dir", s.dir as string]);
    const briefPath = (JSON.parse(brief.stdout) as Json).brief as string;
    expect(JSON.parse(temp.text(briefPath))).toMatchObject({ pr: 77, branch: "s0-98-new-thing" });
    expect(await start(r, github, "--task", "S0-98")).toMatchObject({ pr: 77, created: false, interrupted: false, opened: false, next: "executor", brief: null });
    temp.write(join(work, "half.txt"), "x");
    expect(await start(r, github, "--task", "S0-98")).toMatchObject({ created: false, interrupted: true, opened: false, brief: briefPath });
  });

  it("keeps the gaps of the executor when init meets the state start wrote", async () => {
    const r = await repo();
    const s = await start(r, { list: [], comments: [] }, "--task", "S0-98");
    const out = join(s.dir as string, "executor.out.json");
    temp.write(out, JSON.stringify({ status: "ready", pr: 77, branch: "s0-98-new-thing", gaps: ["G-99"] }));
    const init = await exec(r.work, tool, ["init", "--task", "S0-98", "--from", out, "--dir", s.dir as string]);
    expect(JSON.parse(init.stdout)).toMatchObject({ ok: true, existed: true });
    expect(JSON.parse(temp.text(join(s.dir as string, "state.json")))).toMatchObject({ pr: 77, branch: "s0-98-new-thing", gaps: ["G-99"] });
  });

  it("resumes a ready PR without comments of the loop at the gate, with its state", async () => {
    const r = await repo();
    const s = await start(r, { list: [PR], comments: [{ body: "looks good" }] }, "--task", "S0-99");
    expect(s).toMatchObject({ pr: 12, branch: "s0-99-x", entry: "none", next: "gate" });
  });

  it("removes the records of runs older than 30 days from the owner's checkout", async () => {
    const r = await repo();
    const runs = join(r.work, ".lattice", "verify-runs");
    const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
    for (const [name, at] of [["old", daysAgo(31)], ["fresh", daysAgo(29)]]) temp.write(join(runs, `${name}.json`), JSON.stringify({ test_set: "kernel", at }));
    expect(await start(r, { list: [PR], comments: [] }, "--task", "S0-99")).toMatchObject({ ok: true, pruned: 1 });
    expect(temp.list(runs)).toEqual(["fresh.json"]);
  });

  it("resumes a PR from the header of its last comment of the loop", async () => {
    const r = await repo();
    const state = { pr: 12, task: "S0-99", branch: "s0-99-x", budget: 3, wave: 1, head: null, base: null, waves: [], findings: [], answers: null, decisions: [], gaps: [], triggers: null, pending: null, owner: null, tidied: false, stopped: false };
    const body = `<!-- dev-loop ${JSON.stringify({ kind: "review", state })} -->\n## Ревью`;
    expect(await start(r, { list: [PR], comments: [{ body }] }, "--pr", "12")).toMatchObject({ task: "S0-99", entry: "review", next: "done" });
  });
});

describe.concurrent("dev-loop start, a task whose file is not on main", { timeout: 60_000 }, () => {
  it("refuses to open a task without its file on main", async () => {
    const r = await repo();
    expect(await start(r, { list: [], comments: [] }, "--task", "S0-97")).toMatchObject({ ok: false, error: "нет файла задачи S0-97 в plan/phases/*/tasks на origin/main" });
  });

  it("opens a task whose file reached main after a refusal, in the worktree the refusal left on the old main", async () => {
    const r = await repo();
    expect(await start(r, { list: [], comments: [] }, "--task", "S0-97")).toMatchObject({ ok: false });
    await advance(r.root, { "plan/phases/S0-x/tasks/S0-97-later.md": "---\nid: S0-97\ntitle: Later\nphase: S0\n---\n" });
    const s = await start(r, { list: [], comments: [] }, "--task", "S0-97");
    expect(s).toMatchObject({ ok: true, pr: 77, branch: "s0-97-later", created: false, interrupted: false, opened: true });
    expect(await sh(s.work as string, ["rev-parse", "HEAD^"])).toBe(await sh(s.work as string, ["rev-parse", "origin/main"]));
  });
});

const none = { list: [], comments: [] };

describe.concurrent("dev-loop start, the owner's checkout brought to main", { timeout: 60_000 }, () => {
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

describe.concurrent("dev-loop start, the owner's checkout left as it is", { timeout: 60_000 }, () => {
  it("leaves a branch whose PR is not merged, and says how far main is", async () => {
    const r = await repo({ ahead: true });
    await sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    expect(await start(r, none, "--task", "S0-98")).toMatchObject({ copy: { branch: "s0-99-x", synced: false, behind: 1 } });
    expect(await sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a branch with commits outside origin/main, even if its PR is merged", async () => {
    const r = await repo({ ahead: true });
    await sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    temp.write(join(r.work, "c.txt"), "c\n");
    await sh(r.work, ["add", "-A"]);
    await sh(r.work, ["commit", "-q", "-m", "after merge"]);
    expect(await start(r, { ...none, merged: [{ number: 12 }] }, "--task", "S0-98")).toMatchObject({ copy: { branch: "s0-99-x", synced: false } });
    expect(await sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a checkout with changes untouched", async () => {
    const r = await repo({ ahead: true });
    temp.write(join(r.work, "a.txt"), "changed\n");
    const s = await start(r, none, "--task", "S0-98");
    expect(s).toMatchObject({ ok: true, copy: { branch: "main", synced: false, behind: 1 } });
    expect((s.copy as Json).why).toEqual(expect.any(String));
    expect(await sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });

  it("does not touch the checkout when start runs from a linked worktree", async () => {
    const r = await repo({ ahead: true });
    const linked = join(r.root, "linked");
    await sh(r.work, ["worktree", "add", "-q", "--detach", linked, "main"]);
    temp.write(r.github, JSON.stringify(none));
    const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github };
    const run = await exec(linked, tool, ["start", "--task", "S0-98", "--root", join(r.root, "loops")], env);
    expect(JSON.parse(run.stdout)).toMatchObject({ copy: { synced: false } });
    expect(await sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });
});
