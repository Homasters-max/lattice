// Thin landing (LG-22…LG-26, LG-54) on the adapters `git-fixture`,
// `store-jsonl`, `acts-fixture`, `clock-fixed`, `ids-counter`: `before` is the
// store at the tail of main (LG-14), the commit is appended to the store on the
// worktree and pushed with it, chained to the tail; a change request never
// writes the store itself (LG-23).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureBranch, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter } from "../../src/adapters/ids-counter/index.js";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { hashBytes } from "../../src/kernel/index.js";
import {
  commitHash,
  land,
  openLines,
  tailView,
  type Commit,
  type Git,
  type LandingOutcome,
  type LandingPorts,
  type Push,
  type Store,
  type Worktree,
} from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

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

const LAND = deepFreeze({ dryRun: false });
const DRY_RUN = deepFreeze({ dryRun: true });

let dir = "";
let opened: Store[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lattice-landing-"));
  opened = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** The ports of landing, frozen; every store landing opens is kept in `opened`, in order. */
function portsOf(over: Partial<LandingPorts> = {}, branches = BRANCHES): LandingPorts {
  return deepFreeze({
    git: createGitFixture({ dir, branches }),
    acts: createActsFixture({ acts: {} }),
    openStore: (w: Worktree) => {
      const store = createStoreJsonl({ dir: w.dir });
      opened.push(store);
      return store;
    },
    clock: createClockFixed({ at: AT }),
    ids: createIdsCounter(),
    ...over,
  });
}

async function mainWorktree(git: Git): Promise<Worktree> {
  const tail = await git.tail("main");
  const w = tail === null ? null : await git.prepare({ request: tail, onto: tail });
  if (w === null || w.kind === "conflict") throw new Error("bug: main of the fixture prepares onto itself");
  return w;
}

/**
 * The commits of the store on main, as opening it reads them (LG-02, LG-38): the tail of each prefix of its
 * lines, opened by `openLines`. A line opening refuses fails the test — none is dropped.
 */
async function commitsOnMain(ports: LandingPorts): Promise<Commit[]> {
  const lines: Uint8Array[] = [];
  for await (const line of ports.openStore(await mainWorktree(ports.git)).commits(1)) lines.push(line);
  return lines.map((_, i) => {
    const opened = openLines(lines.slice(0, i + 1));
    if (!opened.ok) throw new Error(`bug: main holds a store opening refuses: ${JSON.stringify(opened.rejections)}`);
    if (opened.value.tail === null) throw new Error("bug: a store of one line or more has a tail");
    return opened.value.tail;
  });
}

const landed = async (ports: LandingPorts, request: string) => {
  const out = await land(ports, request, LAND);
  if (out.outcome !== "commit") throw new Error(`bug: ${request} ended ${out.outcome}`);
  return out.commit;
};

const refusals = (out: LandingOutcome) => (out.outcome === "rejections" ? out.rejections.map((r) => [r.rule, r.path]) : out.outcome);

/** The git of the fixture, every push it was given kept in `pushes`. */
function recording(branches = BRANCHES): { readonly git: Git; readonly pushes: Push[] } {
  const inner = portsOf({}, branches).git;
  const pushes: Push[] = [];
  const push = (p: Push) => {
    pushes.push(p);
    return inner.push(p);
  };
  return { git: { tail: (ref) => inner.tail(ref), prepare: (p) => inner.prepare(p), push }, pushes };
}

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("landing into git (LG-22, LG-23)", () => {
  it("LG-23: the commit is a line of store/knowledge.jsonl on main, and the proposal file is gone", async () => {
    const ports = portsOf();
    const commit = await landed(ports, "cr/a");
    expect(await commitsOnMain(ports)).toEqual([commit]);
    expect(await (await mainWorktree(ports.git)).list("store/")).toEqual(["store/knowledge.jsonl"]);
  });

  it("LG-06, G-14: the next commit is chained to the tail: its prev is the hash of the one before", async () => {
    const ports = portsOf();
    const first = await landed(ports, "cr/a");
    const second = await landed(ports, "cr/b");
    expect([first.prev, second.seq, second.base, second.prev]).toEqual([null, 2, 1, commitHash(first)]);
    const view = await tailView(ports);
    expect(view.ok ? [view.value.seq, view.value.current("demo/a")?.rev, view.value.current("demo/b")?.rev] : []).toEqual([2, 1, 1]);
  });

  it("LG-02: append carries the delta the commit folds to, into the store on the worktree", async () => {
    const ports = portsOf();
    await landed(ports, "cr/a");
    const rows: string[] = [];
    for await (const r of opened.at(-1)?.rows("") ?? []) rows.push(`${r.key}@${r.from}`);
    expect(rows).toEqual(["current:demo/a@1"]);
  });

  it("LG-26: a dry run pushes nothing", async () => {
    const ports = portsOf();
    const tail = await ports.git.tail("main");
    expect((await land(ports, "cr/a", DRY_RUN)).outcome).toBe("commit");
    expect([await ports.git.tail("main"), await commitsOnMain(ports)]).toEqual([tail, []]);
  });
});

describe("the landing commit in git (LG-22)", () => {
  it("LG-22: carries the trailers Lattice-Proposal and Lattice-Seq; those of OB-07 arrive with S0-20", async () => {
    const { git, pushes } = recording();
    const commit = await landed(portsOf({ git }), "cr/a");
    expect(pushes.map((p) => [p.ref, p.message, p.trailers])).toEqual([
      [
        "main",
        "lattice: land commit 1",
        [
          { key: "Lattice-Proposal", value: commit.proposal },
          { key: "Lattice-Seq", value: "1" },
        ],
      ],
    ]);
  });
});

describe("the store a change request brings (LG-14, LG-23)", () => {
  const KNOWLEDGE = "store/knowledge.jsonl";
  const read = async (git: Git) => new TextDecoder().decode((await (await mainWorktree(git)).read(KNOWLEDGE)) ?? new Uint8Array());

  /** Main holds the store landing wrote for cr/a; cr/x, a change request from that main, writes `files` of that file. */
  async function fromLanded(files: (file: string) => GitFixtureBranch["files"]) {
    const git = createGitFixture({ dir, branches: BRANCHES });
    const ports = portsOf({ git });
    await landed(ports, "cr/a");
    const file = await read(git);
    git.branch("cr/x", { from: "main", files: { ...files(file), "store/proposals/x.json": proposal("demo/x") } });
    return { ports, file };
  }

  // A trigger brings bytes no landing writes (plan/closure-check.md: raw store lines only for a trigger).
  const BROUGHT: readonly (readonly [string, (file: string) => string | null])[] = [
    ["the last line feed removed", (file) => file.slice(0, -1)],
    ["an empty line added", (file) => `${file}\n`],
    ["a line appended", (file) => `${file}{"seq":2,"records":[]}\n`],
    ["the file removed", () => null],
  ];

  it.each(BROUGHT)("LG-23: refuses a change request that changed the bytes of store/knowledge.jsonl — %s — dry run or not, and lands nothing", async (_, bring) => {
    const { ports, file } = await fromLanded((f) => ({ [KNOWLEDGE]: bring(f) }));
    const brought = bring(file);
    const refusal = { rule: "LG-23", path: "/store/knowledge.jsonl", expected: hashBytes(utf8(file)), got: brought === null ? null : hashBytes(utf8(brought)) };
    for (const options of [DRY_RUN, LAND]) {
      const out = await land(ports, "cr/x", options);
      expect(out.outcome === "rejections" ? out.rejections : out).toMatchObject([refusal]);
    }
    expect(await read(ports.git)).toBe(file);
  });

  it("LG-23: refuses a change request that put a directory in place of store/knowledge.jsonl, never throws", async () => {
    const { ports, file } = await fromLanded(() => ({ [KNOWLEDGE]: null, [`${KNOWLEDGE}/x`]: "x\n" }));
    const refusal = { rule: "LG-23", path: "/store/knowledge.jsonl", expected: hashBytes(utf8(file)), got: [`${KNOWLEDGE}/x`] };
    expect(await land(ports, "cr/x", LAND)).toMatchObject({ outcome: "rejections", rejections: [refusal] });
    expect(await read(ports.git)).toBe(file);
  });

  it("LG-14, LG-23: lands on a store the change request brings unchanged, with before at the tail of main", async () => {
    const { ports } = await fromLanded(() => ({}));
    const commit = await landed(ports, "cr/x");
    expect([commit.seq, commit.base, commit.records.map((r) => r.id)]).toEqual([2, 1, ["demo/x"]]);
  });

  it("LG-23: a directory in place of store/knowledge.jsonl on main is refused, never thrown", async () => {
    // A trigger: a raw tree on main that no landing writes, as a broken repository holds it.
    const ports = portsOf({}, { ...BRANCHES, main: { files: { "store/knowledge.jsonl/x": "x\n" } } });
    expect(refusals(await land(ports, "cr/a", DRY_RUN))).toEqual([["LG-23", "/store/knowledge.jsonl"]]);
    expect(await tailView(ports)).toMatchObject({ ok: false, rejections: [{ rule: "LG-23", got: ["store/knowledge.jsonl/x"] }] });
  });

  it("LG-06: a store on main whose line is no commit is refused on opening, never thrown", async () => {
    // A trigger: a raw line on main that no landing writes, as a broken repository holds it.
    const ports = portsOf({}, { ...BRANCHES, main: { files: { "store/knowledge.jsonl": "{}\n" } } });
    expect(refusals(await land(ports, "cr/a", DRY_RUN))).toContainEqual(["LG-06", "/0/seq"]);
    expect((await tailView(ports)).ok).toBe(false);
  });
});

describe("a change request that changes no knowledge (LG-25, LG-54)", () => {
  const empty = JSON.stringify({ session: { id: "01JB2X00000000000000000SES" }, intents: [], sig: null });
  const branches = { ...BRANCHES, "cr/code": { from: "main", files: { "src/y.ts": "y\n", "store/proposals/code.json": empty } } };

  it("LG-25, LG-54: a proposal without intents lands as a no-op: no knowledge commit, the proposal file removed, the code kept", async () => {
    const { git, pushes } = recording(branches);
    const ports = portsOf({ git }, branches);
    expect(await land(ports, "cr/code", DRY_RUN)).toEqual({ outcome: "no-op", pushed: false });
    expect(pushes).toEqual([]);
    expect(await land(ports, "cr/code", LAND)).toEqual({ outcome: "no-op", pushed: true });
    expect([await (await mainWorktree(ports.git)).list(""), await commitsOnMain(ports)]).toEqual([["README.md", "src/y.ts"], []]);
    expect(pushes.map((p) => [p.message, p.trailers.map((t) => t.key)])).toEqual([["lattice: land no-op", ["Lattice-Proposal"]]]);
  });
});

describe("landing outcomes (LG-24, LG-25, LG-54)", () => {
  it("LG-24: ends moved when main moves before the push", async () => {
    const inner = portsOf().git;
    const git: Git = {
      tail: (ref) => inner.tail(ref),
      prepare: (p) => inner.prepare(p),
      push: async (p) => {
        // Someone else moves main first: a commit of code, with its own message and no trailers of landing.
        const w = await inner.prepare({ request: "cr/readme", onto: p.expected });
        if (w.kind === "worktree") await inner.push({ worktree: w, ref: "main", expected: p.expected, message: "m", trailers: [] });
        return inner.push(p);
      },
    };
    expect(await land(portsOf({ git }), "cr/a", LAND)).toEqual({ outcome: "moved" });
  });

  it("LG-24: ends conflict when the code of the change request conflicts with main", async () => {
    const ports = portsOf();
    const onto = (await mainWorktree(ports.git)).onto;
    const w = await ports.git.prepare({ request: "cr/readme", onto });
    if (w.kind === "worktree") await ports.git.push({ worktree: w, ref: "main", expected: onto, message: "m", trailers: [] });
    expect(await land(ports, "cr/clash", LAND)).toEqual({ outcome: "conflict", paths: ["README.md"] });
  });

  it("LG-54, KR-10: refuses a change request that does not exist, one without a proposal and a proposal that is not JSON", async () => {
    const ports = portsOf();
    expect(refusals(await land(ports, "cr/typo", DRY_RUN))).toEqual([["LG-54", ""]]);
    expect(refusals(await land(ports, "cr/none", DRY_RUN))).toEqual([["LG-54", "/store/proposals"]]);
    expect(refusals(await land(ports, "cr/broken", DRY_RUN))).toEqual([["KR-10", "/store/proposals/cr-x.json"]]);
  });
});
