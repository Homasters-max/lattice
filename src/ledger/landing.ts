// Landing (LG-22…LG-26): a `knowledge` commit is born in git. It reaches git,
// acts, the store, time and ids only through ports (LG-23, ST-04). The walking
// skeleton checks the change request before apply in the order of G-19, takes
// `before` from the store at the tail of `main` (LG-14, tail.ts), appends the
// commit to the `jsonl` store on the worktree — nothing for a no-op (LG-25) —
// removes the proposal and pushes. Every refusal is placed from the root of
// the tree of the change request (Q-29). Rebuilds on a moved `main`,
// `awaiting-act`, the land session event, acts as events, the trailers of
// OB-07 and `request` arrive with S0-19 and S0-20.
import { parseJsonBytes, refuse, reject, type Rejections, type Result } from "../kernel/index.js";
import { apply, type LandActs } from "./apply.js";
import { commitHash, encodeCommit, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Acts } from "./ports/acts.js";
import type { Clock } from "./ports/clock.js";
import type { Trailer, Worktree } from "./ports/git.js";
import type { Ids } from "./ports/ids.js";
import type { Store } from "./ports/store.js";
import { proposalHash, readProposal, type Proposal } from "./proposal.js";
import type { Rows } from "./rows.js";
import type { View } from "./rows-view.js";
import { LG_23, LG_54 } from "./rules.js";
import { atPath, KNOWLEDGE, MAIN, nameOf, openTail, type AtPath, type TailPorts } from "./tail.js";

export interface LandingPorts extends TailPorts {
  readonly acts: Acts;
  readonly clock: Clock;
  readonly ids: Ids;
}

export type LandOptions = { readonly dryRun: boolean };

/** LG-25, LG-26: how landing ends; a dry run ends `commit` or `no-op` with `pushed: false`. */
export type LandingOutcome =
  | { readonly outcome: "commit"; readonly commit: Commit; readonly pushed: boolean }
  | { readonly outcome: "no-op"; readonly pushed: boolean }
  | { readonly outcome: "rejections"; readonly rejections: Rejections }
  | { readonly outcome: "moved" }
  | { readonly outcome: "conflict"; readonly paths: readonly string[] };

// LG-50: the proposals of a store in the tree of a change request.
const PROPOSALS = "store/proposals/";

/** LG-54: the head of the change request named; one that does not exist carries no proposal. */
function changeRequest(head: string | null): Result<string> {
  if (head !== null) return { ok: true, value: head };
  return refuse(reject(LG_54, { intent: null, path: "", expected: "a change request", got: null }));
}

/** LG-54: the one proposal file of a change request, given the files under `store/proposals/`. */
function proposalPath(files: readonly string[]): Result<string> {
  const [only, ...more] = files;
  if (only !== undefined && more.length === 0) return { ok: true, value: only };
  return refuse(reject(LG_54, { intent: null, path: "/store/proposals", expected: "one proposal file", got: [...files] }));
}

const same = (a: Uint8Array | null, b: AtPath) =>
  a === null || b === null || !(b instanceof Uint8Array) ? a === b : a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * LG-23: only the `jsonl` adapter writes `store/knowledge.jsonl`, and only landing opens it — so a change
 * request brings the file byte for byte as at the tail of `main`, or both lack it; a directory in its place
 * changed it too. What main holds there `openTail` has checked.
 */
function keptKnowledge(tail: Uint8Array | null, request: AtPath): Result<AtPath> {
  if (same(tail, request)) return { ok: true, value: request };
  return refuse(reject(LG_23, { intent: null, path: `/${KNOWLEDGE}`, expected: nameOf(tail), got: nameOf(request) }));
}

type Found = { readonly path: string; readonly proposal: Proposal };

/** The proposal of a change request: one file (LG-54), I-JSON (KR-10), of the form of LG-09. */
async function proposalOf(worktree: Worktree): Promise<Result<Found>> {
  const path = proposalPath(await worktree.list(PROPOSALS));
  if (!path.ok) return path;
  const bytes = await worktree.read(path.value);
  if (bytes === null) throw new Error(`bug: git listed ${path.value} and cannot read it`);
  const value = parseJsonBytes(bytes, `/${path.value}`);
  const proposal = value.ok ? readProposal(value.value, `/${path.value}`) : value;
  return proposal.ok ? { ok: true, value: { path: path.value, proposal: proposal.value } } : proposal;
}

const rejected = (r: { readonly rejections: Rejections }): LandingOutcome => ({ outcome: "rejections", rejections: r.rejections });

/**
 * LG-24, Q-28: a change request whose code conflicts with main ends `conflict` — unless the conflict is at
 * `store/knowledge.jsonl` or under it. Main holds that file only as landing wrote it (LG-23), so a conflict there is
 * the change request's own change of it, refused LG-23 as on a main that did not move.
 */
function conflicted(tail: Uint8Array | null, paths: readonly string[]): LandingOutcome {
  const store = paths.filter((p) => p === KNOWLEDGE || p.startsWith(`${KNOWLEDGE}/`));
  if (store.length === 0) return { outcome: "conflict", paths };
  return { outcome: "rejections", rejections: [reject(LG_23, { intent: null, path: `/${KNOWLEDGE}`, expected: nameOf(tail), got: { conflict: store } })] };
}

/** What landing checked before apply: the worktree of the change request, its store and proposal, and `before`. */
type Checked = Found & {
  readonly onto: string;
  readonly worktree: Worktree;
  readonly store: Store;
  readonly view: View & Rows;
  readonly tail: Commit | null;
};

/**
 * The checks of a change request before apply, in the order of G-19: it exists (LG-54); the store at the tail of
 * main opens (LG-23, LG-06) — without it there is no `before` (LG-14) and no `onto` to merge onto; it merges (LG-24,
 * Q-28); its proposal (LG-54, KR-10, LG-09); the bytes of the store it brings (LG-23).
 */
async function check(ports: LandingPorts, request: string): Promise<LandingOutcome | Checked> {
  const head = changeRequest(await ports.git.tail(request));
  if (!head.ok) return rejected(head);
  // LG-14: `before` is the read view at the tail — the store of main, never the one the request brings.
  const before = await openTail(ports);
  if (!before.ok) return rejected(before);
  const { onto, view, tail, file } = before.value;
  const worktree = await ports.git.prepare({ request, onto });
  if (worktree.kind === "conflict") return conflicted(file, worktree.paths);
  const found = await proposalOf(worktree);
  if (!found.ok) return rejected(found);
  const kept = keptKnowledge(file, await atPath(worktree, KNOWLEDGE));
  if (!kept.ok) return rejected(kept);
  return { ...found.value, onto, view, tail, worktree, store: ports.openStore(worktree) };
}

/** G-14: apply knows neither the tail nor the change request; landing chains the commit to the tail. */
const onTail = (candidate: Commit, tail: Commit | null): Commit => ({ ...candidate, prev: tail === null ? null : commitHash(tail) });

/** LG-22: the trailers of the landing commit that name the proposal and the `seq`; those of OB-07 arrive with S0-20. */
const trailersOf = (proposal: string, seq: number | null): readonly Trailer[] => [
  { key: "Lattice-Proposal", value: proposal },
  ...(seq === null ? [] : [{ key: "Lattice-Seq", value: String(seq) }]),
];

/** LG-25: `commit`, or `no-op` where apply wrote no knowledge commit. */
const ended = (commit: Commit | null, pushed: boolean): LandingOutcome => (commit === null ? { outcome: "no-op", pushed } : { outcome: "commit", commit, pushed });

/**
 * LG-22, LG-25: the git commit of landing — the knowledge commit appended to the store on the worktree, none
 * for a no-op, the proposal file removed, the code of the change request kept — pushed onto `main`.
 */
async function pushed(ports: LandingPorts, checked: Checked, commit: Commit | null): Promise<LandingOutcome> {
  const { onto, worktree, store, path, proposal, view } = checked;
  if (commit !== null) await store.append({ commit: encodeCommit(commit), delta: fold(view, commit, []), evidence: [] });
  await worktree.remove(path);
  const message = commit === null ? "lattice: land no-op" : `lattice: land commit ${commit.seq}`;
  const trailers = trailersOf(proposalHash(proposal), commit?.seq ?? null);
  const done = await ports.git.push({ worktree, ref: MAIN, expected: onto, message, trailers });
  return done === "moved" ? { outcome: "moved" } : ended(commit, true);
}

/** Lands the proposal of a change request on the tail of `main`, or only checks it with `dryRun` (LG-26). */
export async function land(ports: LandingPorts, request: string, options: LandOptions): Promise<LandingOutcome> {
  const checked = await check(ports, request);
  if ("outcome" in checked) return checked;
  const acts: LandActs = { session: { id: ports.ids.ulid(), at: ports.clock.now() }, events: await ports.acts.read(request) };
  const applied = apply(checked.view, checked.proposal, acts, []);
  if (!applied.ok) return rejected(applied);
  const commit = applied.value === "no-op" ? null : onTail(applied.value, checked.tail);
  return options.dryRun ? ended(commit, false) : pushed(ports, checked, commit);
}
