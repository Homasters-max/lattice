// Thin landing (LG-22…LG-26, LG-54) on the adapters `git-fixture`,
// `store-jsonl`, `acts-fixture`, `clock-fixed`, `ids-counter`: the commit is
// appended to the store on the worktree and pushed with it, chained to the tail.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter } from "../../src/adapters/ids-counter/index.js";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { commitHash, decodeCommit, land, tailView, type Commit, type Git, type LandingPorts, type Store, type Worktree } from "../../src/ledger/index.js";

const AT = "2026-10-06T12:00:00.000000Z";
const proposal = (id: string) =>
  JSON.stringify({
    session: { id: "01JB2X00000000000000000SES" },
    intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: AT, body: { text: id } }],
    sig: null,
  });

const BRANCHES: GitFixtureOptions["branches"] = {
  main: { files: { "README.md": "one\n" } },
  "cr/a": { from: "main", files: { "store/proposals/cr-a.json": proposal("demo/a") } },
  "cr/b": { from: "main", files: { "store/proposals/cr-b.json": proposal("demo/b") } },
  "cr/readme": { from: "main", files: { "README.md": "two\n" } },
  "cr/clash": { from: "main", files: { "README.md": "three\n", "store/proposals/cr-c.json": proposal("demo/c") } },
  "cr/none": { from: "main", files: { "src/x.ts": "x\n" } },
  "cr/broken": { from: "main", files: { "store/proposals/cr-x.json": "{" } },
};

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lattice-landing-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function portsOf(over: Partial<LandingPorts> = {}): LandingPorts & { readonly opened: Store[] } {
  const opened: Store[] = [];
  return {
    git: createGitFixture({ dir, branches: BRANCHES }),
    acts: createActsFixture({ acts: {} }),
    openStore: (w: Worktree) => {
      const store = createStoreJsonl({ dir: w.dir });
      opened.push(store);
      return store;
    },
    clock: createClockFixed({ at: AT }),
    ids: createIdsCounter(),
    opened,
    ...over,
  };
}

async function commitsOnMain(ports: LandingPorts): Promise<Commit[]> {
  const w = await ports.git.prepare({ request: "main", onto: await ports.git.tail("main") });
  if (w.kind === "conflict") throw new Error("bug: main conflicts with itself");
  const out: Commit[] = [];
  for await (const line of ports.openStore(w).commits(1)) {
    const c = decodeCommit(line, out.length);
    if (c.ok) out.push(c.value);
  }
  return out;
}

const landed = async (ports: LandingPorts, request: string) => {
  const out = await land(ports, request, { dryRun: false });
  if (out.outcome !== "commit") throw new Error(`bug: ${request} ended ${out.outcome}`);
  return out.commit;
};

describe("landing into git (LG-22, LG-23)", () => {
  it("LG-23: the commit is a line of store/knowledge.jsonl on main, and the proposal file is gone", async () => {
    const ports = portsOf();
    const commit = await landed(ports, "cr/a");
    expect(await commitsOnMain(ports)).toEqual([commit]);
    const main = await ports.git.prepare({ request: "main", onto: await ports.git.tail("main") });
    expect(main.kind === "worktree" ? await main.list("store/") : []).toEqual(["store/knowledge.jsonl"]);
  });

  it("LG-06, G-14: the next commit is chained to the tail: its prev is the hash of the one before", async () => {
    const ports = portsOf();
    const first = await landed(ports, "cr/a");
    const second = await landed(ports, "cr/b");
    expect([first.prev, second.seq, second.base, second.prev]).toEqual([null, 2, 1, commitHash(first)]);
    const view = await tailView(ports);
    expect(view.ok ? [view.value.seq, view.value.current("demo/a")?.rev, view.value.current("demo/b")?.rev] : []).toEqual([2, 1, 1]);
  });

  it("LG-02: append carries the delta the commit folds to", async () => {
    const ports = portsOf();
    await landed(ports, "cr/a");
    const rows: string[] = [];
    for await (const r of ports.opened[0]?.rows("") ?? []) rows.push(`${r.key}@${r.from}`);
    expect(rows).toEqual(["current:demo/a@1"]);
  });

  it("LG-26: a dry run pushes nothing", async () => {
    const ports = portsOf();
    const tail = await ports.git.tail("main");
    expect((await land(ports, "cr/a", { dryRun: true })).outcome).toBe("commit");
    expect([await ports.git.tail("main"), await commitsOnMain(ports)]).toEqual([tail, []]);
  });
});

describe("landing outcomes (LG-24, LG-25)", () => {
  it("LG-24: ends moved when main moves before the push", async () => {
    const inner = portsOf().git;
    const git: Git = {
      tail: (ref) => inner.tail(ref),
      prepare: (p) => inner.prepare(p),
      push: async (p) => {
        const w = await inner.prepare({ request: "cr/readme", onto: p.expected });
        if (w.kind === "worktree") await inner.push({ ...p, worktree: w });
        return inner.push(p);
      },
    };
    expect(await land(portsOf({ git }), "cr/a", { dryRun: false })).toEqual({ outcome: "moved" });
  });

  it("LG-24: ends conflict when the code of the change request conflicts with main", async () => {
    const ports = portsOf();
    const onto = await ports.git.tail("main");
    const w = await ports.git.prepare({ request: "cr/readme", onto });
    if (w.kind === "worktree") await ports.git.push({ worktree: w, ref: "main", expected: onto, message: "m", trailers: [] });
    expect(await land(ports, "cr/clash", { dryRun: false })).toEqual({ outcome: "conflict", paths: ["README.md"] });
  });

  it("LG-54, KR-10: refuses a change request without a proposal and a proposal that is not JSON", async () => {
    const ports = portsOf();
    const rule = async (request: string) => {
      const out = await land(ports, request, { dryRun: true });
      return out.outcome === "rejections" ? out.rejections.map((r) => [r.rule, r.path]) : out.outcome;
    };
    expect(await rule("cr/none")).toEqual([["LG-54", "/store/proposals"]]);
    expect(await rule("cr/broken")).toEqual([["KR-10", "/store/proposals/cr-x.json"]]);
  });
});
