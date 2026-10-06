// Landing (LG-22…LG-26): a `knowledge` commit is born in git. It reaches git,
// acts, the store, time and ids only through ports (LG-23, ST-04). The walking
// skeleton prepares the change request onto the tail of `main`, appends the
// commit to the `jsonl` store on the worktree, removes the proposal and
// pushes. Rebuilds on a moved `main`, `awaiting-act`, the land session event,
// acts as events, the trailers of OB-07 and `request` arrive with S0-19 and
// S0-20.
import { decodeUtf8, parseJson, refuse, reject, type Rejections, type Result } from "../kernel/index.js";
import { apply, type LandActs } from "./apply.js";
import { commitHash, encodeCommit, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Acts } from "./ports/acts.js";
import type { Clock } from "./ports/clock.js";
import type { Git, Trailer, Worktree } from "./ports/git.js";
import type { Ids } from "./ports/ids.js";
import type { Store } from "./ports/store.js";
import { readProposal, type Proposal } from "./proposal.js";
import { LG_54 } from "./rules.js";
import { openView, type View } from "./view.js";

export interface LandingPorts {
  readonly git: Git;
  readonly acts: Acts;
  /** Opens the `jsonl` store on a worktree (LG-23). */
  readonly openStore: (worktree: Worktree) => Store;
  readonly clock: Clock;
  readonly ids: Ids;
}

export type LandOptions = { readonly dryRun: boolean };

/** LG-25, LG-26: how landing ends; a dry run ends `commit` with `pushed: false`. */
export type LandingOutcome =
  | { readonly outcome: "commit"; readonly commit: Commit; readonly pushed: boolean }
  | { readonly outcome: "rejections"; readonly rejections: Rejections }
  | { readonly outcome: "moved" }
  | { readonly outcome: "conflict"; readonly paths: readonly string[] };

const MAIN = "main";
const PROPOSALS = "store/proposals/";

/** LG-54: the one proposal file of a change request, given the files under `store/proposals/`. */
export function proposalPath(files: readonly string[]): Result<string> {
  const [only, ...more] = files;
  if (only !== undefined && more.length === 0) return { ok: true, value: only };
  return refuse(reject(LG_54, { intent: null, path: "/store/proposals", expected: "one proposal file", got: [...files] }));
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

/** G-14: apply knows neither the tail nor the change request; landing chains the commit to the tail. */
const onTail = (candidate: Commit, tail: Commit | null): Commit => ({ ...candidate, prev: tail === null ? null : commitHash(tail) });

const trailersOf = (c: Commit): readonly Trailer[] => [
  { key: "Lattice-Proposal", value: c.proposal },
  { key: "Lattice-Seq", value: String(c.seq) },
];

const rejected = (r: { readonly rejections: Rejections }): LandingOutcome => ({ outcome: "rejections", rejections: r.rejections });

/** Lands the proposal of a change request on the tail of `main`, or only checks it with `dryRun` (LG-26). */
export async function land(ports: LandingPorts, request: string, options: LandOptions): Promise<LandingOutcome> {
  const onto = await ports.git.tail(MAIN);
  const worktree = await ports.git.prepare({ request, onto });
  if (worktree.kind === "conflict") return { outcome: "conflict", paths: worktree.paths };
  const found = await proposalOf(worktree);
  if (!found.ok) return rejected(found);
  const store = ports.openStore(worktree);
  const opened = await openView(store);
  if (!opened.ok) return rejected(opened);
  const acts: LandActs = { session: { id: ports.ids.ulid(), at: ports.clock.now() }, events: await ports.acts.read(request) };
  const { view, tail } = opened.value;
  const applied = apply(view, found.value.proposal, acts, []);
  if (!applied.ok) return rejected(applied);
  const commit = onTail(applied.value, tail);
  if (options.dryRun) return { outcome: "commit", commit, pushed: false };
  await store.append({ commit: encodeCommit(commit), delta: fold(view, commit, []), evidence: [] });
  await worktree.remove(found.value.path);
  const message = `lattice: land commit ${commit.seq}`;
  const pushed = await ports.git.push({ worktree, ref: MAIN, expected: onto, message, trailers: trailersOf(commit) });
  return pushed === "moved" ? { outcome: "moved" } : { outcome: "commit", commit, pushed: true };
}

/** The read view at the tail of `main`: the store opened on a worktree of `main` alone. */
export async function tailView(ports: LandingPorts): Promise<Result<View>> {
  const onto = await ports.git.tail(MAIN);
  const worktree = await ports.git.prepare({ request: MAIN, onto });
  if (worktree.kind === "conflict") throw new Error("bug: main conflicts with itself");
  const opened = await openView(ports.openStore(worktree));
  return opened.ok ? { ok: true, value: opened.value.view } : opened;
}
