// Thin landing (LG-22…LG-26, LG-54) on the adapters `git-fixture`,
// `store-jsonl`, `acts-fixture`, `clock-fixed`, `ids-counter`: `before` is the
// store at the tail of main (LG-14), the commit is appended to the store on the
// worktree and pushed with it, chained to the tail; a change request never
// writes the store itself (LG-23).
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashBytes } from "../../src/kernel/index.js";
import {
  commitHash,
  land,
  openTail,
  type Git,
  type LandingOutcome,
  type LandingPorts,
  type Push,
  type Store,
} from "../../src/ledger/index.js";
import { AT, gitForTests, landingPortsForTests, type GitFixtureBranch, type GitFixtureOptions } from "../support/assembly.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { proposal, storeTextOf, text } from "../support/landing.js";

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

/** The ports of landing, frozen by the test assembly; every store landing opens is kept in `opened`, in order. */
function portsOf(over: Partial<LandingPorts> = {}, branches = BRANCHES): LandingPorts {
  const ports = landingPortsForTests({ dir, branches }, over);
  const openStore: LandingPorts["openStore"] = (w) => {
    const store = ports.openStore(w);
    opened.push(store);
    return store;
  };
  // Landing never changes its ports: the assembly froze them deep, and the object that adds the recording openStore is frozen too.
  return Object.freeze({ ...ports, openStore });
}

/** The store on main, as opening it at the tail reads it (LG-02, LG-38); a store opening refuses fails the test. */
async function storeOnMain(ports: LandingPorts) {
  const opened = await openTail(ports);
  if (!opened.ok) throw new Error(`bug: main holds a store opening refuses: ${JSON.stringify(opened.rejections)}`);
  return opened.value;
}

/** The store on main as text: `store/knowledge.jsonl` as `openTail` read it, `""` where main has none. */
const storeTextOnMain = async (ports: LandingPorts) => text((await storeOnMain(ports)).file);

/** The tail of main and a worktree of `request` prepared onto it; without `request`, of the tail commit alone. */
async function onMain(git: Git, request?: string) {
  const onto = await git.tail("main");
  const worktree = onto === null ? null : await git.prepare({ request: request ?? onto, onto });
  if (onto === null || worktree?.kind !== "worktree") throw new Error(`bug: ${request ?? "main"} of the fixture prepares onto main`);
  return { onto, worktree };
}

/** The paths of the files under `under` on main: the tree of its tail commit, code and proposals, which the store does not answer. */
async function filesOnMain(git: Git, under: string): Promise<readonly string[]> {
  const { worktree } = await onMain(git);
  try {
    return await worktree.list(under);
  } finally {
    await worktree.release();
  }
}

/** Someone else moves main: the code of `request` pushed onto its tail, with its own message and no trailers of landing. */
async function moveMain(git: Git, request: string): Promise<void> {
  const { onto, worktree } = await onMain(git, request);
  await git.push({ worktree, ref: "main", expected: onto, message: "m", trailers: [] });
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
    expect(await storeTextOnMain(ports)).toBe(storeTextOf([commit]));
    expect(await filesOnMain(ports.git, "store/")).toEqual(["store/knowledge.jsonl"]);
  });

  // G-14: landing fills prev.
  it("LG-06: the next commit is chained to the tail: its prev is the hash of the one before", async () => {
    const ports = portsOf();
    const first = await landed(ports, "cr/a");
    const second = await landed(ports, "cr/b");
    expect([first.prev, second.seq, second.base, second.prev]).toEqual([null, 2, 1, commitHash(first)]);
    const { view } = await storeOnMain(ports);
    expect([view.seq, view.current("demo/a")?.rev, view.current("demo/b")?.rev]).toEqual([2, 1, 1]);
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
    expect([await ports.git.tail("main"), await storeTextOnMain(ports)]).toEqual([tail, storeTextOf([])]);
  });
});

describe("the landing commit in git (LG-22)", () => {
  // The trailers of OB-07 arrive with S0-20 (Q-26).
  it("LG-22: carries the trailers Lattice-Proposal and Lattice-Seq", async () => {
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

const KNOWLEDGE = "store/knowledge.jsonl";

describe("the store a change request brings (LG-14, LG-23)", () => {
  /** Main holds the store landing wrote for cr/a; cr/x, a change request from that main, writes `files` of that file. */
  async function fromLanded(files: (file: string) => GitFixtureBranch["files"]) {
    const git = gitForTests({ dir, branches: BRANCHES });
    const ports = portsOf({ git });
    await landed(ports, "cr/a");
    const file = await storeTextOnMain(ports);
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
    expect(await storeTextOnMain(ports)).toBe(file);
  });

  it("LG-23: refuses a change request that put a directory in place of store/knowledge.jsonl, never throws", async () => {
    const { ports, file } = await fromLanded(() => ({ [KNOWLEDGE]: null, [`${KNOWLEDGE}/x`]: "x\n" }));
    const refusal = { rule: "LG-23", path: "/store/knowledge.jsonl", expected: hashBytes(utf8(file)), got: [`${KNOWLEDGE}/x`] };
    expect(await land(ports, "cr/x", LAND)).toMatchObject({ outcome: "rejections", rejections: [refusal] });
    expect(await storeTextOnMain(ports)).toBe(file);
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
    expect(await openTail(ports)).toMatchObject({ ok: false, rejections: [{ rule: "LG-23", got: ["store/knowledge.jsonl/x"] }] });
  });

  it("LG-06: a store on main whose line is no commit is refused on opening, never thrown", async () => {
    // A trigger: a raw line on main that no landing writes, as a broken repository holds it.
    const ports = portsOf({}, { ...BRANCHES, main: { files: { "store/knowledge.jsonl": "{}\n" } } });
    expect(refusals(await land(ports, "cr/a", DRY_RUN))).toContainEqual(["LG-06", "/store/knowledge.jsonl/1/seq"]);
    expect((await openTail(ports)).ok).toBe(false);
  });
});

describe("a conflict at the store a change request brings (LG-23, Q-28)", () => {
  // Q-28: main holds store/knowledge.jsonl only as landing wrote it, so a conflict there is the change request's own change.
  it("LG-23: refuses a change request that changed store/knowledge.jsonl on a main that moved and wrote it too — a conflict at it is no conflict outcome — dry run or not", async () => {
    // A trigger: cr/x brings a store file no landing wrote, forked from main before cr/a landed.
    const git = gitForTests({ dir, branches: { ...BRANCHES, "cr/x": { from: "main", files: { [KNOWLEDGE]: "forged\n", "store/proposals/x.json": proposal("demo/x") } } } });
    const ports = portsOf({ git });
    await landed(ports, "cr/a");
    const file = await storeTextOnMain(ports);
    const refusal = { rule: "LG-23", intent: null, path: "/store/knowledge.jsonl", expected: hashBytes(utf8(file)), got: { conflict: [KNOWLEDGE] } };
    for (const options of [DRY_RUN, LAND]) expect(await land(ports, "cr/x", options)).toMatchObject({ outcome: "rejections", rejections: [refusal] });
    expect(await storeTextOnMain(ports)).toBe(file);
  });

  it("LG-23: refuses a change request that put a directory where main, moved since, has store/knowledge.jsonl: the clash is a conflict at the file", async () => {
    // A trigger: cr/x puts a directory where main, moved since, has the file landing wrote.
    const git = gitForTests({ dir, branches: { ...BRANCHES, "cr/x": { from: "main", files: { [`${KNOWLEDGE}/x`]: "x\n", "store/proposals/x.json": proposal("demo/x") } } } });
    const ports = portsOf({ git });
    await landed(ports, "cr/a");
    const out = await land(ports, "cr/x", DRY_RUN);
    expect(out.outcome === "rejections" ? out.rejections.map((r) => [r.rule, r.path, r.got]) : out).toEqual([["LG-23", "/store/knowledge.jsonl", { conflict: [KNOWLEDGE] }]]);
  });

  it("LG-23: refuses a conflict under store/knowledge.jsonl as one at it, naming only the paths of the store", async () => {
    // A git whose merge of cr/a reports a conflict under the file, as a git can for a file against a directory.
    const inner = portsOf().git;
    const paths = ["README.md", `${KNOWLEDGE}/x`, "store/knowledge.jsonl.bak"];
    const git: Git = { tail: (ref) => inner.tail(ref), prepare: (p) => (p.request === "cr/a" ? Promise.resolve({ kind: "conflict", paths }) : inner.prepare(p)), push: (p) => inner.push(p) };
    const out = await land(portsOf({ git }), "cr/a", DRY_RUN);
    expect(out.outcome === "rejections" ? out.rejections.map((r) => [r.rule, r.path, r.expected, r.got]) : out).toEqual([["LG-23", "/store/knowledge.jsonl", null, { conflict: [`${KNOWLEDGE}/x`] }]]);
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
    expect([await filesOnMain(ports.git, ""), await storeTextOnMain(ports)]).toEqual([["README.md", "src/y.ts"], storeTextOf([])]);
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
        await moveMain(inner, "cr/readme");
        return inner.push(p);
      },
    };
    expect(await land(portsOf({ git }), "cr/a", LAND)).toEqual({ outcome: "moved" });
  });

  it("LG-24: ends conflict when the code of the change request conflicts with main", async () => {
    const ports = portsOf();
    await moveMain(ports.git, "cr/readme");
    expect(await land(ports, "cr/clash", LAND)).toEqual({ outcome: "conflict", paths: ["README.md"] });
  });

  it("LG-54, KR-10: refuses a change request that does not exist, one without a proposal and a proposal that is not JSON", async () => {
    const ports = portsOf();
    expect(refusals(await land(ports, "cr/typo", DRY_RUN))).toEqual([["LG-54", ""]]);
    expect(refusals(await land(ports, "cr/none", DRY_RUN))).toEqual([["LG-54", "/store/proposals"]]);
    expect(refusals(await land(ports, "cr/broken", DRY_RUN))).toEqual([["KR-10", "/store/proposals/cr-x.json"]]);
  });
});

describe("the order of the outcomes of landing (G-19)", () => {
  /** What is wrong at once with cr/x and the main it lands on; each step of the ladder mends the earliest. */
  type Faults = {
    /** Main holds a directory in place of store/knowledge.jsonl, so its store does not open. */
    readonly brokenMain?: boolean;
    /** Main moved past the fork of cr/x and changed README.md, as cr/x did. */
    readonly codeConflicts?: boolean;
    /** cr/x brings its own store/knowledge.jsonl. */
    readonly storeChanged?: boolean;
    /** Main moved past the fork of cr/x by a landing, which wrote store/knowledge.jsonl too. */
    readonly mainLanded?: boolean;
    /** The proposal file of cr/x is no JSON. */
    readonly proposalBroken?: boolean;
  };

  /** A dry run of cr/x with these faults. Triggers: a raw tree on main and a store file no landing wrote. */
  async function dryRunWith(f: Faults, request = "cr/x"): Promise<LandingOutcome> {
    const main = { "README.md": "one\n", ...(f.brokenMain === true ? { "store/knowledge.jsonl/x": "x\n" } : {}) };
    const own = {
      ...(f.codeConflicts === true ? { "README.md": "three\n" } : {}),
      ...(f.storeChanged === true ? { "store/knowledge.jsonl": "forged\n" } : {}),
      "store/proposals/cr-x.json": f.proposalBroken === true ? "{" : proposal("demo/x"),
    };
    const ports = portsOf({}, { ...BRANCHES, main: { files: main }, "cr/x": { from: "main", files: own } });
    if (f.codeConflicts === true) await moveMain(ports.git, "cr/readme");
    if (f.mainLanded === true) await landed(ports, "cr/a");
    return land(ports, request, DRY_RUN);
  }

  const all: Faults = { brokenMain: true, codeConflicts: true, storeChanged: true, proposalBroken: true };
  const forged = hashBytes(utf8("forged\n"));

  it("LG-54: a change request that does not exist is refused first, even on a main whose store does not open", async () => {
    expect(refusals(await dryRunWith(all, "cr/typo"))).toEqual([["LG-54", ""]]);
  });

  it("LG-23: then the store at the tail of main: one that does not open refuses a change request whose code conflicts with main", async () => {
    expect(await dryRunWith(all)).toMatchObject({ outcome: "rejections", rejections: [{ rule: "LG-23", path: "/store/knowledge.jsonl", expected: "a file or none" }] });
  });

  it("LG-24, LG-23: then the merge: a conflict of code ends conflict, a conflict at store/knowledge.jsonl is refused LG-23 (Q-28)", async () => {
    const mended = { ...all, brokenMain: false };
    expect(await dryRunWith(mended)).toEqual({ outcome: "conflict", paths: ["README.md"] });
    expect(await dryRunWith({ ...mended, mainLanded: true })).toMatchObject({
      outcome: "rejections",
      rejections: [{ rule: "LG-23", path: "/store/knowledge.jsonl", got: { conflict: ["store/knowledge.jsonl"] } }],
    });
  });

  it("KR-10, LG-23: then the proposal, then the bytes of the store the change request brings", async () => {
    const merged = { ...all, brokenMain: false, codeConflicts: false };
    expect(refusals(await dryRunWith(merged))).toEqual([["KR-10", "/store/proposals/cr-x.json"]]);
    const read = { ...merged, proposalBroken: false };
    expect(await dryRunWith(read)).toMatchObject({ outcome: "rejections", rejections: [{ rule: "LG-23", path: "/store/knowledge.jsonl", expected: null, got: forged }] });
    expect((await dryRunWith({ ...read, storeChanged: false })).outcome).toBe("commit");
  });
});

describe("time and ids of landing (LG-23)", () => {
  it("LG-23: the land session takes its id from ids and the commit its at from clock — of the test assembly, ids-counter and clock-fixed", async () => {
    // The intent is written a day before the clock of the tests, so the commit's at can come only from the clock.
    const written = "2026-10-05T09:00:00.000000Z";
    const own = JSON.stringify({ session: { id: "01JB2X00000000000000000SES" }, intents: [{ op: "entity", id: "demo/t", type: "demo/note@1", expected: null, at: written, body: {} }], sig: null });
    const ports = portsOf({}, { ...BRANCHES, "cr/t": { from: "main", files: { "store/proposals/t.json": own } } });
    const first = await landed(ports, "cr/a");
    const second = await landed(ports, "cr/t");
    expect([first.by, first.at, second.by, second.at, second.records.map((r) => [r.by, r.at])]).toEqual([
      "00000000000000000000000001",
      AT,
      "00000000000000000000000002",
      AT,
      [["01JB2X00000000000000000SES", written]],
    ]);
  });
});

describe("the worktrees landing prepares (LG-23, D206)", () => {
  const empty = JSON.stringify({ session: { id: "01JB2X00000000000000000SES" }, intents: [], sig: null });
  // A trigger: cr/forged brings a store file no landing wrote.
  const branches = {
    ...BRANCHES,
    "cr/code": { from: "main", files: { "src/y.ts": "y\n", "store/proposals/code.json": empty } },
    "cr/forged": { from: "main", files: { [KNOWLEDGE]: "forged\n", "store/proposals/f.json": proposal("demo/f") } },
  };

  /** A git whose push finds main moved: someone else pushed cr/readme just before it. */
  function movingMain(): Git {
    const inner = portsOf({}, branches).git;
    const push = async (p: Push) => {
      await moveMain(inner, "cr/readme");
      return inner.push(p);
    };
    return { tail: (ref) => inner.tail(ref), prepare: (p) => inner.prepare(p), push };
  }

  const fails = (): never => {
    throw new Error("acts unreachable");
  };

  // Each outcome of landing and of opening the store at the tail, with what it ends with.
  const OUTCOMES: readonly (readonly [string, () => Promise<unknown>, unknown])[] = [
    ["commit", async () => (await land(portsOf({}, branches), "cr/a", LAND)).outcome, "commit"],
    ["commit, dry run", async () => (await land(portsOf({}, branches), "cr/a", DRY_RUN)).outcome, "commit"],
    ["no-op", async () => land(portsOf({}, branches), "cr/code", LAND), { outcome: "no-op", pushed: true }],
    ["no-op, dry run", async () => land(portsOf({}, branches), "cr/code", DRY_RUN), { outcome: "no-op", pushed: false }],
    ["rejections: no proposal (LG-54)", async () => refusals(await land(portsOf({}, branches), "cr/none", LAND)), [["LG-54", "/store/proposals"]]],
    ["rejections: no JSON (KR-10)", async () => refusals(await land(portsOf({}, branches), "cr/broken", LAND)), [["KR-10", "/store/proposals/cr-x.json"]]],
    ["rejections: the store brought (LG-23)", async () => refusals(await land(portsOf({}, branches), "cr/forged", LAND)), [["LG-23", "/store/knowledge.jsonl"]]],
    ["rejections of apply", async () => {
      const ports = portsOf({}, branches);
      await landed(ports, "cr/a");
      return (await land(ports, "cr/a", LAND)).outcome;
    }, "rejections"],
    ["moved", async () => land(portsOf({ git: movingMain() }, branches), "cr/a", LAND), { outcome: "moved" }],
    ["conflict", async () => {
      const ports = portsOf({}, branches);
      await moveMain(ports.git, "cr/readme");
      return land(ports, "cr/clash", LAND);
    }, { outcome: "conflict", paths: ["README.md"] }],
    ["an exception", async () => land(portsOf({ acts: { read: fails } }, branches), "cr/a", LAND).catch((e: Error) => e.message), "acts unreachable"],
    ["the store at the tail opened", async () => (await openTail(portsOf({}, branches))).ok, true],
    ["the store at the tail refused", async () => (await openTail(portsOf({}, { ...branches, main: { files: { [`${KNOWLEDGE}/x`]: "x\n" } } }))).ok, false],
  ];

  it.each(OUTCOMES)("LG-23: no worktree is left in the directory of git-fixture after %s", async (_, run, ends) => {
    expect(await run()).toEqual(ends);
    expect(readdirSync(dir)).toEqual([]);
  });
});
