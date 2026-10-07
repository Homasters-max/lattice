// dev-loop start opens or resumes a loop in one step (plan/dev-loop.md): it finds the PR of the task,
// adds or checks the worktree and says where to go next. It also brings the owner's checkout to a fresh main
// when that loses nothing. GitHub is a fake gh that answers from a file.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
const dirs: string[] = [];
type Json = { [key: string]: unknown };
type Repo = { root: string; work: string; github: string };

function sh(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

// A checkout with an origin whose main and branch s0-99-x exist; github holds what the fake gh answers.
function repo(): Repo {
  const root = mkdtempSync(join(tmpdir(), "dev-loop-start-"));
  dirs.push(root);
  const work = join(root, "checkout");
  mkdirSync(work);
  sh(root, ["init", "-q", "--bare", "origin.git"]);
  for (const args of [["init", "-q", "-b", "main"], ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["remote", "add", "origin", join(root, "origin.git")]]) sh(work, args);
  writeFileSync(join(work, "a.txt"), "a\n");
  sh(work, ["add", "-A"]);
  sh(work, ["commit", "-q", "-m", "base"]);
  sh(work, ["push", "-q", "origin", "HEAD:refs/heads/main", "HEAD:refs/heads/s0-99-x"]);
  const fake = join(root, "gh.mjs");
  writeFileSync(fake, [
    'import { readFileSync } from "node:fs";',
    "const data = JSON.parse(readFileSync(process.env.FAKE_GITHUB, \"utf8\"));",
    "const args = process.argv.slice(2);",
    'const json = args[args.indexOf("--json") + 1];',
    'const merged = args[args.indexOf("--state") + 1] === "merged";',
    'console.log(JSON.stringify(merged ? data.merged ?? [] : args[1] === "list" ? data.list : json === "comments" ? { comments: data.comments } : data.list[0]));',
  ].join("\n"));
  return { root, work, github: join(root, "github.json") };
}

function start(r: Repo, github: Json, ...args: string[]): Json {
  writeFileSync(r.github, JSON.stringify(github));
  const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github };
  const run = spawnSync(process.execPath, [tool, "start", ...args, "--root", join(r.root, "loops")], { cwd: r.work, encoding: "utf8", env });
  return JSON.parse(run.stdout) as Json;
}

// main on origin moves one commit ahead of the checkout, as after a merge of a PR.
function advance(r: Repo): void {
  const other = join(r.root, "other");
  sh(r.root, ["clone", "-q", "-b", "main", join(r.root, "origin.git"), other]);
  for (const args of [["config", "user.email", "t@t"], ["config", "user.name", "t"]]) sh(other, args);
  writeFileSync(join(other, "b.txt"), "b\n");
  sh(other, ["add", "-A"]);
  sh(other, ["commit", "-q", "-m", "merged"]);
  sh(other, ["push", "-q", "origin", "main"]);
}

const PR = { number: 12, title: "S0-99 · Something", headRefName: "s0-99-x", isDraft: false };

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("dev-loop start", { timeout: 30_000 }, () => {
  it("opens a new task: a worktree from origin/main and the executor next", () => {
    const r = repo();
    const s = start(r, { list: [], comments: [] }, "--task", "S0-99");
    expect(s).toMatchObject({ ok: true, task: "S0-99", pr: null, created: true, interrupted: false, entry: "none", next: "executor" });
    expect(start(r, { list: [], comments: [] }, "--task", "S0-99")).toMatchObject({ created: false, interrupted: false });
    writeFileSync(join(s.work as string, "half.txt"), "x");
    expect(start(r, { list: [], comments: [] }, "--task", "S0-99")).toMatchObject({ created: false, interrupted: true, brief: null });
  });

  it("resumes a ready PR without comments of the loop at the gate, with its state", () => {
    const r = repo();
    const s = start(r, { list: [PR], comments: [{ body: "looks good" }] }, "--task", "S0-99");
    expect(s).toMatchObject({ pr: 12, branch: "s0-99-x", entry: "none", next: "gate" });
  });

  it("resumes a PR from the header of its last comment of the loop", () => {
    const r = repo();
    const state = { pr: 12, task: "S0-99", branch: "s0-99-x", budget: 3, wave: 1, head: null, base: null, waves: [], findings: [], answers: null, decisions: [], gaps: [], triggers: null, pending: null, owner: null, tidied: false, stopped: false };
    const body = `<!-- dev-loop ${JSON.stringify({ kind: "review", state })} -->\n## Ревью`;
    expect(start(r, { list: [PR], comments: [{ body }] }, "--pr", "12")).toMatchObject({ task: "S0-99", entry: "review", next: "done" });
  });
});

const none = { list: [], comments: [] };

describe("dev-loop start, the owner's checkout brought to main", { timeout: 30_000 }, () => {
  it("fast-forwards a clean checkout on main to origin/main", () => {
    const r = repo();
    advance(r);
    expect(start(r, none, "--task", "S0-99")).toMatchObject({ copy: { branch: "main", synced: true, behind: 0 } });
    expect(sh(r.work, ["rev-parse", "HEAD"])).toBe(sh(r.work, ["rev-parse", "origin/main"]));
  });

  it("moves a clean checkout from a branch whose PR is merged to a fresh main", () => {
    const r = repo();
    sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    advance(r);
    expect(start(r, { ...none, merged: [{ number: 12 }] }, "--task", "S0-99")).toMatchObject({ copy: { branch: "main", synced: true, from: "s0-99-x" } });
    expect(sh(r.work, ["branch", "--show-current"])).toBe("main");
    expect(sh(r.work, ["rev-parse", "HEAD"])).toBe(sh(r.work, ["rev-parse", "origin/main"]));
  });
});

describe("dev-loop start, the owner's checkout left as it is", { timeout: 30_000 }, () => {
  it("leaves a branch whose PR is not merged, and says how far main is", () => {
    const r = repo();
    sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    advance(r);
    expect(start(r, none, "--task", "S0-99")).toMatchObject({ copy: { branch: "s0-99-x", synced: false, behind: 1 } });
    expect(sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a branch with commits outside origin/main, even if its PR is merged", () => {
    const r = repo();
    sh(r.work, ["checkout", "-q", "-b", "s0-99-x"]);
    writeFileSync(join(r.work, "c.txt"), "c\n");
    sh(r.work, ["add", "-A"]);
    sh(r.work, ["commit", "-q", "-m", "after merge"]);
    advance(r);
    expect(start(r, { ...none, merged: [{ number: 12 }] }, "--task", "S0-99")).toMatchObject({ copy: { branch: "s0-99-x", synced: false } });
    expect(sh(r.work, ["branch", "--show-current"])).toBe("s0-99-x");
  });

  it("leaves a checkout with changes untouched", () => {
    const r = repo();
    advance(r);
    writeFileSync(join(r.work, "a.txt"), "changed\n");
    const s = start(r, none, "--task", "S0-99");
    expect(s).toMatchObject({ ok: true, copy: { branch: "main", synced: false, behind: 1 } });
    expect((s.copy as Json).why).toEqual(expect.any(String));
    expect(sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });

  it("does not touch the checkout when start runs from a linked worktree", () => {
    const r = repo();
    const linked = join(r.root, "linked");
    sh(r.work, ["worktree", "add", "-q", "--detach", linked, "main"]);
    advance(r);
    writeFileSync(r.github, JSON.stringify(none));
    const env = { ...process.env, DEV_LOOP_GH: join(r.root, "gh.mjs"), FAKE_GITHUB: r.github };
    const run = spawnSync(process.execPath, [tool, "start", "--task", "S0-99", "--root", join(r.root, "loops")], { cwd: linked, encoding: "utf8", env });
    expect(JSON.parse(run.stdout)).toMatchObject({ copy: { synced: false } });
    expect(sh(r.work, ["rev-list", "--count", "HEAD..origin/main"])).toBe("1");
  });
});
