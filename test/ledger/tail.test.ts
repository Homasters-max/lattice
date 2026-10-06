// Opening the store at the tail of `main` (LG-02, LG-14, LG-23, LG-38) on the
// adapters `git-fixture` and `store-jsonl`: a worktree of the tail commit
// alone, what it holds at `store/knowledge.jsonl`, and the read view folded
// from genesis.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { fileOf } from "../../src/adapters/store-jsonl/index.js";
import { commitHash, createView, encodeCommit, land, openTail, type LandingPorts } from "../../src/ledger/index.js";
import { landingPorts, proposal } from "../support/landing.js";

const BRANCHES: GitFixtureOptions["branches"] = {
  main: { files: { "README.md": "one\n" } },
  "cr/a": { from: "main", files: { "store/proposals/cr-a.json": proposal("demo/a") } },
  "cr/b": { from: "main", files: { "store/proposals/cr-b.json": proposal("demo/b") } },
};

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lattice-tail-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const portsOf = (branches = BRANCHES): LandingPorts => landingPorts({ dir, branches });

describe("the store at the tail of main (LG-02, LG-38)", () => {
  it("LG-02: main without store/knowledge.jsonl opens as the empty store", async () => {
    const ports = portsOf();
    const opened = await openTail(ports);
    expect(opened.ok ? [opened.value.onto, opened.value.view.seq, opened.value.tail, opened.value.file] : opened).toEqual([
      await ports.git.tail("main"),
      0,
      null,
      null,
    ]);
  });

  it("LG-02, LG-38: folds the store of two landings from genesis: the view at the second, its commit the tail", async () => {
    const ports = portsOf();
    const commits = [];
    for (const request of ["cr/a", "cr/b"]) {
      const out = await land(ports, request, { dryRun: false });
      if (out.outcome !== "commit") throw new Error(`bug: ${request} ended ${out.outcome}`);
      commits.push(out.commit);
    }
    const [first, second] = commits;
    const opened = await openTail(ports);
    if (!opened.ok) throw new Error(`bug: the store landing wrote does not open: ${JSON.stringify(opened.rejections)}`);
    const { onto, view, tail, file } = opened.value;
    expect([onto, view.seq, view.current("demo/a")?.rev, view.current("demo/b")?.rev]).toEqual([await ports.git.tail("main"), 2, 1, 1]);
    expect([tail, tail?.prev]).toEqual([second, first === undefined ? null : commitHash(first)]);
    const text = (bytes: Uint8Array | null) => (bytes === null ? null : new TextDecoder().decode(bytes));
    expect(text(file)).toBe(text(fileOf(commits.map(encodeCommit).join("\n"))));
  });
});

describe("a broken store on main (LG-23, LG-06)", () => {
  it("LG-23: a directory in place of store/knowledge.jsonl on main is refused, never thrown", async () => {
    // A trigger: a raw tree on main that no landing writes, as a broken repository holds it.
    const ports = portsOf({ ...BRANCHES, main: { files: { "store/knowledge.jsonl/x": "x\n" } } });
    expect(await openTail(ports)).toMatchObject({
      ok: false,
      rejections: [{ rule: "LG-23", intent: null, path: "/store/knowledge.jsonl", expected: "a file or none", got: ["store/knowledge.jsonl/x"] }],
    });
  });

  it("LG-06: a store on main whose line is no commit is refused, never thrown", async () => {
    // A trigger: a raw line on main that no landing writes, as a broken repository holds it.
    const ports = portsOf({ ...BRANCHES, main: { files: { "store/knowledge.jsonl": "{}\n" } } });
    const opened = await openTail(ports);
    expect(opened.ok ? [] : opened.rejections.map((r) => [r.rule, r.path])).toContainEqual(["LG-06", "/0/seq"]);
  });
});

describe("the read view runtime and capabilities get (LG-38)", () => {
  it("LG-38: createView answers the questions of View and holds no row at run time", () => {
    const view = createView(0, []);
    expect(["row" in view, view.seq, view.current("demo/a")]).toEqual([false, 0, null]);
  });
});
