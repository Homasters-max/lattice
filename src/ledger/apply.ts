// Apply (LG-14): the only path into `knowledge`, a pure function
// `apply(before, proposal, acts, evidence) → commit | no-op | rejections`. The
// walking skeleton has phase 1 with the id check (KR-06) and, from S0-04, the
// canonical form (KR-10) and the body limit (KR-13); it reports `no-op` for a
// proposal without intents (LG-12, LG-54) and forms the candidate commit
// (LG-15); the phases of LG-16, the no-op intents of LG-13 and the idempotence
// of LG-12 arrive with S0-13…S0-18.
import { canon, checkId, hashRecord, KERNEL_VERSION, refused, rejectionsOf, type Record, type Rejection, type Result } from "../kernel/index.js";
import { known, type Commit, type Evidence } from "./commit.js";
import type { Act } from "./ports/acts.js";
import { canonicalIntents, NO_FACTS, proposalHash, type Intent, type Proposal } from "./proposal.js";
import type { View } from "./rows.js";

/** The land session and the acts landing formed (LG-22); the session's `at` is the time of landing. */
export type LandActs = {
  readonly session: { readonly id: string; readonly at: string };
  readonly events: readonly Act[];
};

function recordOf(before: View, proposal: Proposal, i: Intent): Record {
  const head = { id: i.id, type: i.type, hash: known(hashRecord(i.type, i.body), "a record"), by: proposal.session.id, at: i.at, body: i.body };
  return i.op === "entity" ? { ...head, rev: (before.current(i.id)?.rev ?? 0) + 1 } : head;
}

/**
 * LG-15: assigns `seq`, `rev` and `hash`; records follow the canonical order of LG-06 (G-03), facts by the key
 * their types declare once apply reads them from `before` (S0-13). Apply knows neither the tail commit nor the
 * change request, so `prev`, `request` and `sig` stay `null`: landing fills `prev` and `request` (G-14) and signs
 * with the land session's key (S0-20).
 */
function candidate(before: View, proposal: Proposal, acts: LandActs): Commit {
  return {
    seq: before.seq + 1,
    prev: null,
    kernel: KERNEL_VERSION,
    base: before.seq,
    proposal: proposalHash(proposal, NO_FACTS),
    proposal_sig: proposal.sig,
    by: acts.session.id,
    at: acts.session.at,
    request: null,
    sig: null,
    records: canonicalIntents(proposal.intents, NO_FACTS).map((i) => recordOf(before, proposal, i)),
  };
}

/** KR-10, KR-12, KR-13: an intent in canonical form, inside it (G-13); then its record within the body limit. */
function canonicalIntent(i: Intent): readonly Rejection[] {
  const place = { intent: i.id, path: "" };
  const form = canon(i, place);
  return form.ok ? rejectionsOf(hashRecord(i.type, i.body, place)) : form.rejections;
}

/**
 * Phase 1, Record (LG-16): the id of every intent (KR-06); the proposal in canonical form (KR-10) — the session and
 * the signature from its root, each intent inside it — and every body within the limit (KR-13). After it, all that
 * the commit is formed of is canonical.
 */
function phaseRecord(p: Proposal): Rejection[] {
  const { intents, ...rest } = p;
  return [...rejectionsOf(canon(rest)), ...intents.flatMap((i) => [...rejectionsOf(checkId(i.op, i.id, { intent: i.id, path: "/id" })), ...canonicalIntent(i)])];
}

/** LG-14: what apply ends with when it refuses nothing — a commit, or `no-op` when no intent changes knowledge. */
type Applied = Commit | "no-op";

/** LG-12: an empty commit is never written — a proposal without intents (LG-54) is a no-op. */
const applied = (before: View, proposal: Proposal, acts: LandActs): Applied =>
  proposal.intents.length === 0 ? "no-op" : candidate(before, proposal, acts);

export const apply: (before: View, proposal: Proposal, acts: LandActs, evidence: readonly Evidence[]) => Result<Applied> = (
  before,
  proposal,
  acts,
) => refused<Applied>(phaseRecord(proposal)) ?? { ok: true, value: applied(before, proposal, acts) };
