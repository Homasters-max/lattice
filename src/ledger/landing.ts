// Landing (LG-22…LG-26): a `knowledge` commit is born in git. It reaches git,
// acts, the store, time and ids only through ports (LG-23, ST-04). The walking
// skeleton lands one proposal on the tail of `main`; the land session event,
// acts as events, rebuilds on a moved `main`, trailers of OB-07 and
// `awaiting-act` arrive with S0-19 and S0-20.
import { parseJson, type Rejections } from "../kernel/index.js";
import { apply, type LandActs } from "./apply.js";
import { commitHash, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Acts } from "./ports/acts.js";
import type { Clock } from "./ports/clock.js";
import type { Git, Trailer, Worktree } from "./ports/git.js";
import type { Ids } from "./ports/ids.js";
import type { Store } from "./ports/store.js";
import { readProposal, type Proposal } from "./proposal.js";
import { readView } from "./view.js";

export interface LandingPorts {
  readonly git: Git;
  readonly acts: Acts;
  readonly store: Store;
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

async function proposalOf(worktree: Worktree): Promise<{ readonly path: string; readonly proposal: Proposal }> {
  const files = (await worktree.list(PROPOSALS)).filter((p) => p.endsWith(".json"));
  const path = files.length === 1 ? files[0] : undefined;
  const bytes = path === undefined ? null : await worktree.read(path);
  if (path === undefined || bytes === null) {
    throw new Error("not in the walking skeleton: refusing a change request without exactly one proposal (LG-54) arrives with S0-20");
  }
  return { path, proposal: readProposal(parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes))) };
}

/** G-14: apply does not know the tail commit or the change request; landing completes the header. */
async function complete(candidate: Commit, store: Store): Promise<Commit> {
  const tail = await store.tail();
  return { ...candidate, prev: tail === null ? null : commitHash(tail) };
}

const trailersOf = (c: Commit): readonly Trailer[] => [
  { key: "Lattice-Proposal", value: c.proposal },
  { key: "Lattice-Seq", value: String(c.seq) },
];

/** Lands the proposal of a change request on the tail of `main`, or only checks it with `dryRun` (LG-26). */
export async function land(ports: LandingPorts, request: string, options: LandOptions): Promise<LandingOutcome> {
  const onto = await ports.git.tail(MAIN);
  const prepared = await ports.git.prepare(request, onto);
  if (prepared.kind === "conflict") return { outcome: "conflict", paths: prepared.paths };
  const { path, proposal } = await proposalOf(prepared);
  const acts: LandActs = { session: { id: ports.ids.ulid(), at: ports.clock.now() }, events: await ports.acts.read(request) };
  const before = await readView(ports.store);
  const applied = apply(before, proposal, acts, []);
  if (!applied.ok) return { outcome: "rejections", rejections: applied.rejections };
  const commit = await complete(applied.value, ports.store);
  if (options.dryRun) return { outcome: "commit", commit, pushed: false };
  await prepared.remove(path);
  const message = `lattice: land commit ${commit.seq}`;
  const pushed = await ports.git.push({ worktree: prepared, ref: MAIN, expected: onto, message, trailers: trailersOf(commit) });
  if (pushed === "moved") return { outcome: "moved" };
  // The memory store is not on the worktree: it follows git only after the push (LG-27); S0-20 appends on the worktree (LG-23).
  await ports.store.append(commit, fold(before, commit, []), []);
  return { outcome: "commit", commit, pushed: true };
}
