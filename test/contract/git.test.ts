// ST-07, LG-23: one set of contract tests for the `git` port, run against
// every adapter of S0-03: `tail`, `prepare` → worktree or conflict, `push` as
// a compare-and-swap; `tail` of a ref that does not exist is `null`; paths come
// in the order of `sortPaths`, the one comparator of the port (Q-18); every
// worktree `prepare` returns is released — by `push`, or by `release` (D206).
import { afterAll, describe, expect, it } from "vitest";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { sortPaths, type Git, type Worktree } from "../../src/ledger/index.js";
import { scratch, type Scratch } from "../support/files.js";

const dirs: Scratch[] = [];
afterAll(() => dirs.forEach((d) => d.remove()));
/** Whether a path is there, in a scratch folder of this run: any of them reads a path inside every one (ST-18). */
function exists(path: string): boolean {
  // Without a scratch folder a "false" would hold for any path, and the checks of a released worktree would pass.
  if (dirs[0] === undefined) throw new Error(`bug: no scratch folder of this run to look for ${path} in`);
  return dirs[0].exists(path);
}

const BRANCHES: GitFixtureOptions["branches"] = {
  main: { files: { "README.md": "one\n", "src/a.ts": "a\n" } },
  "cr/add": { from: "main", files: { "src/b.ts": "b\n" } },
  "cr/edit": { from: "main", files: { "README.md": "two\n" } },
  "cr/clash": { from: "main", files: { "README.md": "three\n" } },
  "cr/names": { from: "main", files: { "src/é.ts": "e\n", "src/B.ts": "B\n", "src/\u{1F600}.ts": "s\n", "src/～.ts": "t\n" } },
  "cr/file": { from: "main", files: { lib: "file\n" } },
  "cr/dir": { from: "main", files: { "lib/y.ts": "y\n" } },
};

const ADAPTERS: readonly { readonly name: string; readonly make: () => Git }[] = [
  {
    name: "git-fixture",
    make: () => {
      const dir = scratch("lattice-git-");
      dirs.push(dir);
      return createGitFixture({ dir: dir.dir, branches: BRANCHES });
    },
  },
];

const text = async (w: Worktree, path: string) => new TextDecoder().decode((await w.read(path)) ?? new Uint8Array());

async function worktree(git: Git, request: string, onto: string): Promise<Worktree> {
  const prepared = await git.prepare({ request, onto });
  if (prepared.kind === "conflict") throw new Error(`bug: ${request} conflicts at ${prepared.paths.join(", ")}`);
  return prepared;
}

async function tailOf(git: Git, ref: string): Promise<string> {
  const tail = await git.tail(ref);
  if (tail === null) throw new Error(`bug: the fixture has ${ref}`);
  return tail;
}

const push = (git: Git, w: Worktree, expected: string) => git.push({ worktree: w, ref: "main", expected, message: "m", trailers: [] });

describe.each(ADAPTERS)("git port: $name", ({ make }) => {
  it("ST-07, LG-54: tail names the commit of a branch, and is null for a ref that does not exist", async () => {
    const git = make();
    const main = await git.tail("main");
    expect([typeof main, await git.tail(main ?? ""), await git.tail("cr/none")]).toEqual(["string", main, null]);
  });

  it("ST-07: prepares a change request onto a commit, as files of a worktree", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const w = await worktree(git, "cr/add", onto);
    expect([w.onto, await w.list("src/"), await text(w, "src/b.ts")]).toEqual([onto, ["src/a.ts", "src/b.ts"], "b\n"]);
  });

  it("ST-07: pushes the worktree as the new commit of the ref, without what it removed", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const w = await worktree(git, "cr/add", onto);
    await w.remove("src/a.ts");
    expect(await push(git, w, onto)).toBe("pushed");
    const after = await worktree(git, "main", await tailOf(git, "main"));
    expect(await after.list("")).toEqual(["README.md", "src/b.ts"]);
  });

  it("ST-07, LG-24: ends moved when the ref is no longer the expected commit", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const [first, second] = [await worktree(git, "cr/add", onto), await worktree(git, "cr/edit", onto)];
    expect(await push(git, first, onto)).toBe("pushed");
    expect(await push(git, second, onto)).toBe("moved");
  });

  it("ST-07, LG-24: ends conflict where main and the change request changed a path differently", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    expect(await push(git, await worktree(git, "cr/edit", onto), onto)).toBe("pushed");
    expect(await git.prepare({ request: "cr/clash", onto: await tailOf(git, "main") })).toEqual({ kind: "conflict", paths: ["README.md"] });
    expect((await git.prepare({ request: "cr/add", onto: await tailOf(git, "main") })).kind).toBe("worktree");
  });
});

describe.each(ADAPTERS)("git port: $name — releasing a worktree (LG-23, D206)", ({ make }) => {
  it("ST-07, LG-23: release removes the directory of the worktree, and a second release does nothing", async () => {
    const git = make();
    const w = await worktree(git, "cr/add", await tailOf(git, "main"));
    expect(exists(w.dir)).toBe(true);
    await w.release();
    expect(exists(w.dir)).toBe(false);
    await w.release();
    expect(exists(w.dir)).toBe(false);
  });

  it("ST-07, LG-23: push releases the worktree it pushes, and a release after it does nothing", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const w = await worktree(git, "cr/add", onto);
    expect(await push(git, w, onto)).toBe("pushed");
    expect(exists(w.dir)).toBe(false);
    await w.release();
    const after = await worktree(git, "main", await tailOf(git, "main"));
    expect([exists(w.dir), await after.list("src/")]).toEqual([false, ["src/a.ts", "src/b.ts"]]);
  });

  it("ST-07, LG-23: a worktree whose push ended moved is released by release", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const [first, second] = [await worktree(git, "cr/add", onto), await worktree(git, "cr/edit", onto)];
    expect([await push(git, first, onto), await push(git, second, onto)]).toEqual(["pushed", "moved"]);
    await second.release();
    expect(exists(second.dir)).toBe(false);
  });

  it("ST-07, LG-23: release of one worktree leaves another of the same commit as it was", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    const [first, second] = [await worktree(git, "cr/add", onto), await worktree(git, "cr/add", onto)];
    await first.release();
    expect([first.dir === second.dir, await text(second, "src/b.ts")]).toEqual([false, "b\n"]);
  });
});

describe.each(ADAPTERS)("git port: $name — paths and what is no file", ({ make }) => {
  // Q-18: one comparator of the port.
  it("ST-07: lists paths in the order of sortPaths — UTF-16 code units, never the locale", async () => {
    const git = make();
    const listed = await (await worktree(git, "cr/names", await tailOf(git, "main"))).list("src/");
    expect(listed).toEqual(sortPaths(listed));
    expect(listed).toEqual(["src/B.ts", "src/a.ts", "src/é.ts", "src/\u{1F600}.ts", "src/～.ts"]);
  });

  it("ST-07: read is null where no file is — a path that does not exist, a directory, a path through a file", async () => {
    const git = make();
    const w = await worktree(git, "cr/add", await tailOf(git, "main"));
    expect([await w.read("src/none.ts"), await w.read("src"), await w.read("README.md/x")]).toEqual([null, null, null]);
  });

  it("ST-07, LG-24: ends conflict where one side put a file and the other a directory at one path", async () => {
    const git = make();
    const onto = await tailOf(git, "main");
    expect(await push(git, await worktree(git, "cr/file", onto), onto)).toBe("pushed");
    expect(await git.prepare({ request: "cr/dir", onto: await tailOf(git, "main") })).toEqual({ kind: "conflict", paths: ["lib"] });
  });
});
