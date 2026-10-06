// Apply (LG-14): the only path into `knowledge`, a pure function
// `apply(before, proposal, acts, evidence) → commit | no-op | rejections`. The
// walking skeleton has phase 1 with the id check (KR-06), reports `no-op` for
// a proposal without intents (LG-12, LG-54) and forms the candidate commit
// (LG-15); the phases of LG-16, the no-op intents of LG-13 and the idempotence
// of LG-12 arrive with S0-13…S0-18.
import { checkId, hashRecord, KERNEL_VERSION, refused, type Record, type Result } from "../kernel/index.js";
import type { Commit, Evidence } from "./commit.js";
import type { Act } from "./ports/acts.js";
import { canonicalIntents, proposalHash, type Intent, type Proposal } from "./proposal.js";
import type { View } from "./view.js";

/** The land session and the acts landing formed (LG-22); the session's `at` is the time of landing. */
export type LandActs = {
  readonly session: { readonly id: string; readonly at: string };
  readonly events: readonly Act[];
};

function recordOf(before: View, proposal: Proposal, i: Intent): Record {
  const head = { id: i.id, type: i.type, hash: hashRecord(i.type, i.body), by: proposal.session.id, at: i.at, body: i.body };
  return i.op === "entity" ? { ...head, rev: (before.current(i.id)?.rev ?? 0) + 1 } : head;
}

/**
 * LG-15: assigns `seq`, `rev` and `hash`; records follow the canonical order of LG-06. Apply knows
 * neither the tail commit nor the change request, so `prev`, `request` and `sig` stay `null`:
 * landing fills `prev` and `request` (G-14), the signature arrives with S0-10 and S0-20.
 */
function candidate(before: View, proposal: Proposal, acts: LandActs): Commit {
  return {
    seq: before.seq + 1,
    prev: null,
    kernel: KERNEL_VERSION,
    base: before.seq,
    proposal: proposalHash(proposal),
    proposal_sig: proposal.sig,
    by: acts.session.id,
    at: acts.session.at,
    request: null,
    sig: null,
    records: canonicalIntents(proposal.intents).map((i) => recordOf(before, proposal, i)),
  };
}

/** Phase 1, Record: the id of every intent (KR-06). */
const phaseRecord = (p: Proposal) => p.intents.flatMap((i) => checkId(i.op, i.id, { intent: i.id, path: "/id" }));

/** LG-14: what apply ends with when it refuses nothing — a commit, or `no-op` when no intent changes knowledge. */
export type Applied = Commit | "no-op";

/** LG-12: an empty commit is never written — a proposal without intents (LG-54) is a no-op. */
const applied = (before: View, proposal: Proposal, acts: LandActs): Applied =>
  proposal.intents.length === 0 ? "no-op" : candidate(before, proposal, acts);

export const apply: (before: View, proposal: Proposal, acts: LandActs, evidence: readonly Evidence[]) => Result<Applied> = (
  before,
  proposal,
  acts,
) => refused<Applied>(phaseRecord(proposal)) ?? { ok: true, value: applied(before, proposal, acts) };
