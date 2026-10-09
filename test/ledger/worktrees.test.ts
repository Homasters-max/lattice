// The worktrees of landing (LG-23, D206): every worktree `prepare` returns is
// released — `push` releases the one it pushes, `release` it on any other
// outcome — so no outcome of landing or of opening the store at the tail of
// main leaves a directory in the one `git-fixture` writes its worktrees to.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KNOWLEDGE, land, openTail, type Git, type LandingPorts, type Push } from "../../src/ledger/index.js";
import { landingPortsForTests, type GitFixtureOptions } from "../support/assembly.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { moveMain, proposal, refusals } from "../support/landing.js";
import { scratch, type Scratch } from "../support/files.js";

const empty = JSON.stringify({ session: { id: "01JB2X00000000000000000SES" }, intents: [], sig: null });

const BRANCHES: GitFixtureOptions["branches"] = {
  main: { files: { "README.md": "one\n" } },
  "cr/a": { from: "main", files: { "store/proposals/cr-a.json": proposal("demo/a") } },
  "cr/readme": { from: "main", files: { "README.md": "two\n" } },
  "cr/clash": { from: "main", files: { "README.md": "three\n", "store/proposals/cr-c.json": proposal("demo/c") } },
  "cr/none": { from: "main", files: { "src/x.ts": "x\n" } },
  "cr/broken": { from: "main", files: { "store/proposals/cr-x.json": "{" } },
  "cr/code": { from: "main", files: { "src/y.ts": "y\n", "store/proposals/code.json": empty } },
  // A trigger: cr/forged brings a store file no landing wrote.
  "cr/forged": { from: "main", files: { [KNOWLEDGE]: "forged\n", "store/proposals/f.json": proposal("demo/f") } },
};

const LAND = deepFreeze({ dryRun: false });
const DRY_RUN = deepFreeze({ dryRun: true });

let own: Scratch;
let dir = "";
beforeEach(() => {
  own = scratch("lattice-worktrees-");
  dir = own.dir;
});
afterEach(() => own.remove());

/** The ports of landing on the git fixture of `branches`, its worktrees under `dir`. */
const portsOf = (over: Partial<LandingPorts> = {}, branches = BRANCHES): LandingPorts => landingPortsForTests({ dir, branches }, over);

/** A git whose push finds main moved: someone else pushed cr/readme just before it. */
function movingMain(): Git {
  const inner = portsOf().git;
  const push = async (p: Push) => {
    await moveMain(inner, "cr/readme");
    return inner.push(p);
  };
  return { tail: (ref) => inner.tail(ref), prepare: (p) => inner.prepare(p), push };
}

const unreachable = (): never => {
  throw new Error("acts unreachable");
};

/** cr/a landed twice: the second apply refuses to create demo/a again. */
async function landedTwice() {
  const ports = portsOf();
  await land(ports, "cr/a", LAND);
  return (await land(ports, "cr/a", LAND)).outcome;
}

/** cr/clash onto a main that changed README.md too. */
async function conflicting() {
  const ports = portsOf();
  await moveMain(ports.git, "cr/readme");
  return land(ports, "cr/clash", LAND);
}

// A trigger: a raw tree on main that no landing writes, as a broken repository holds it.
const brokenMain = { ...BRANCHES, main: { files: { [`${KNOWLEDGE}/x`]: "x\n" } } };

// Each outcome of landing and of opening the store at the tail, and what it ends with.
const OUTCOMES: readonly (readonly [string, () => Promise<unknown>, unknown])[] = [
  ["commit", async () => (await land(portsOf(), "cr/a", LAND)).outcome, "commit"],
  ["commit, dry run", async () => (await land(portsOf(), "cr/a", DRY_RUN)).outcome, "commit"],
  ["no-op", () => land(portsOf(), "cr/code", LAND), { outcome: "no-op", pushed: true }],
  ["no-op, dry run", () => land(portsOf(), "cr/code", DRY_RUN), { outcome: "no-op", pushed: false }],
  ["rejections without a proposal (LG-54)", async () => refusals(await land(portsOf(), "cr/none", LAND)), [["LG-54", "/store/proposals"]]],
  ["rejections of a proposal that is no JSON (KR-10)", async () => refusals(await land(portsOf(), "cr/broken", LAND)), [["KR-10", "/store/proposals/cr-x.json"]]],
  ["rejections of the store a change request brings (LG-23)", async () => refusals(await land(portsOf(), "cr/forged", LAND)), [["LG-23", "/store/knowledge.jsonl"]]],
  ["rejections of apply", landedTwice, "rejections"],
  ["moved", () => land(portsOf({ git: movingMain() }), "cr/a", LAND), { outcome: "moved" }],
  ["conflict", conflicting, { outcome: "conflict", paths: ["README.md"] }],
  ["a throw", () => land(portsOf({ acts: { read: unreachable } }), "cr/a", LAND).catch((e: Error) => e.message), "acts unreachable"],
  ["opening the store at the tail", async () => (await openTail(portsOf())).ok, true],
  ["opening the store at the tail refused (LG-23)", async () => (await openTail(portsOf({}, brokenMain))).ok, false],
];

describe("the worktrees landing prepares (LG-23, D206)", () => {
  it.each(OUTCOMES)("LG-23: no worktree is left in the directory of git-fixture after %s", async (_, run, ends) => {
    expect(await run()).toEqual(ends);
    expect(own.list("")).toEqual([]);
  });
});
