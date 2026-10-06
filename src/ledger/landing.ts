// Landing (LG-22…LG-26): a `knowledge` commit is born in git. It reaches git,
// acts, the store, time and ids only through ports (LG-23, ST-04). The walking
// skeleton opens the store at the tail of `main` for `before` (LG-14),
// prepares the change request onto that tail, refuses one that changed the
// bytes of `store/knowledge.jsonl` itself (LG-23), appends the commit to the
// `jsonl` store on the worktree — nothing for a no-op (LG-25) — removes the
// proposal and pushes. Rebuilds on a moved `main`, `awaiting-act`, the land
// session event, acts as events, the trailers of OB-07 and `request` arrive
// with S0-19 and S0-20.
import { decodeUtf8, hashBytes, parseJson, refuse, reject, type Rejections, type Result } from "../kernel/index.js";
import { apply, type LandActs } from "./apply.js";
import { commitHash, encodeCommit, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Acts } from "./ports/acts.js";
import type { Clock } from "./ports/clock.js";
import type { Git, Trailer, Worktree } from "./ports/git.js";
import type { Ids } from "./ports/ids.js";
import type { Store } from "./ports/store.js";
import { proposalHash, readProposal, type Proposal } from "./proposal.js";
import type { Rows } from "./rows.js";
import { LG_23, LG_54 } from "./rules.js";
import { linesOf, openLines, type View } from "./view.js";

export interface LandingPorts {
  readonly git: Git;
  readonly acts: Acts;
  /** Opens the `jsonl` store on a worktree (LG-23). */
  readonly openStore: (worktree: Worktree) => Store;
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

const MAIN = "main";
// LG-50: the paths of a store in the tree of a change request.
const PROPOSALS = "store/proposals/";
const KNOWLEDGE = "store/knowledge.jsonl";

/** LG-54: the head of the change request named; one that does not exist carries no proposal. */
export function changeRequest(head: string | null): Result<string> {
  if (head !== null) return { ok: true, value: head };
  return refuse(reject(LG_54, { intent: null, path: "", expected: "a change request", got: null }));
}

/** LG-54: the one proposal file of a change request, given the files under `store/proposals/`. */
export function proposalPath(files: readonly string[]): Result<string> {
  const [only, ...more] = files;
  if (only !== undefined && more.length === 0) return { ok: true, value: only };
  return refuse(reject(LG_54, { intent: null, path: "/store/proposals", expected: "one proposal file", got: [...files] }));
}

/** What a worktree holds at a path: the bytes of a file, the files of a directory, or nothing. */
type Held = Uint8Array | { readonly files: readonly string[] } | null;

async function heldAt(worktree: Worktree, path: string): Promise<Held> {
  const bytes = await worktree.read(path);
  if (bytes !== null) return bytes;
  const files = await worktree.list(`${path}/`);
  return files.length > 0 ? { files } : null;
}

const same = (a: Uint8Array | null, b: Held) =>
  a === null || b === null || !(b instanceof Uint8Array) ? a === b : a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Bytes are no JSON value: a refusal names a file by its hash (Q-19), a directory by its files. */
const named = (held: Held) => (held === null ? null : held instanceof Uint8Array ? hashBytes(held) : [...held.files]);

/** LG-23: only the `jsonl` adapter writes `store/knowledge.jsonl`, so main holds it as a file or not at all. */
function fileOnMain(tail: Held): Result<Uint8Array | null> {
  if (tail === null || tail instanceof Uint8Array) return { ok: true, value: tail };
  return refuse(reject(LG_23, { intent: null, path: `/${KNOWLEDGE}`, expected: "a file or none", got: named(tail) }));
}

/**
 * LG-23: only the `jsonl` adapter writes `store/knowledge.jsonl`, and only landing opens it — so main holds it
 * as a file or not at all, and a change request brings the file byte for byte as at the tail of `main`, or
 * both lack it; a directory in its place changed it too.
 */
export function keptKnowledge(tail: Held, request: Held): Result<Held> {
  const onMain = fileOnMain(tail);
  if (!onMain.ok) return onMain;
  if (same(onMain.value, request)) return { ok: true, value: request };
  return refuse(reject(LG_23, { intent: null, path: `/${KNOWLEDGE}`, expected: named(tail), got: named(request) }));
}

type Found = { readonly path: string; readonly proposal: Proposal };

/** The proposal of a change request: one file (LG-54), I-JSON (KR-10), of the form of LG-09. */
async function proposalOf(worktree: Worktree): Promise<Result<Found>> {
  const path = proposalPath(await worktree.list(PROPOSALS));
  if (!path.ok) return path;
  const bytes = await worktree.read(path.value);
  if (bytes === null) throw new Error(`bug: git listed ${path.value} and cannot read it`);
  const text = decodeUtf8(bytes, `/${path.value}`);
  const value = text.ok ? parseJson(text.value, `/${path.value}`) : text;
  const proposal = value.ok ? readProposal(value.value) : value;
  return proposal.ok ? { ok: true, value: { path: path.value, proposal: proposal.value } } : proposal;
}

type Tail = { readonly onto: string; readonly knowledge: Held; readonly lines: readonly Uint8Array[] };

/** The tail of `main` (GL-05): a worktree of that commit alone, the bytes of its `store/knowledge.jsonl` and the lines of its store. */
async function tailOf(ports: LandingPorts): Promise<Tail> {
  const onto = await ports.git.tail(MAIN);
  // A store lives on main from its init (LG-47, S0-23).
  if (onto === null) throw new Error(`bug: the repository of the store has no ${MAIN}`);
  const worktree = await ports.git.prepare({ request: onto, onto });
  if (worktree.kind === "conflict") throw new Error("bug: a commit conflicts with itself");
  const knowledge = await heldAt(worktree, KNOWLEDGE);
  // The store opens only on a file: `keptKnowledge` and `tailView` refuse a directory in its place (LG-23).
  return { onto, knowledge, lines: knowledge instanceof Uint8Array ? await linesOf(ports.openStore(worktree)) : [] };
}

const rejected = (r: { readonly rejections: Rejections }): LandingOutcome => ({ outcome: "rejections", rejections: r.rejections });

/** What landing checked before apply: the worktree of the change request, its store and proposal, and `before`. */
type Checked = Found & {
  readonly onto: string;
  readonly worktree: Worktree;
  readonly store: Store;
  readonly view: View & Rows;
  readonly tail: Commit | null;
};

async function check(ports: LandingPorts, request: string): Promise<LandingOutcome | Checked> {
  const head = changeRequest(await ports.git.tail(request));
  if (!head.ok) return rejected(head);
  const tail = await tailOf(ports);
  const worktree = await ports.git.prepare({ request, onto: tail.onto });
  if (worktree.kind === "conflict") return { outcome: "conflict", paths: worktree.paths };
  const found = await proposalOf(worktree);
  if (!found.ok) return rejected(found);
  // LG-14: `before` is the read view at the tail — the store of main, never the one the request brings.
  const before = openLines(tail.lines);
  if (!before.ok) return rejected(before);
  const kept = keptKnowledge(tail.knowledge, await heldAt(worktree, KNOWLEDGE));
  if (!kept.ok) return rejected(kept);
  return { ...found.value, ...before.value, onto: tail.onto, worktree, store: ports.openStore(worktree) };
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

/** The read view at the tail of `main`: the store opened on a worktree of that commit alone. */
export async function tailView(ports: LandingPorts): Promise<Result<View>> {
  const tail = await tailOf(ports);
  const file = fileOnMain(tail.knowledge);
  if (!file.ok) return file;
  const opened = openLines(tail.lines);
  return opened.ok ? { ok: true, value: opened.value.view } : opened;
}
