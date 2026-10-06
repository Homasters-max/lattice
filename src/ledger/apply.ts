// Apply (LG-14): the only path into `knowledge`, a pure function
// `apply(before, proposal, acts, evidence) → commit | rejections`. The walking
// skeleton has phase 1 with the id check (KR-06) and forms the candidate
// commit (LG-15); the phases of LG-16 arrive with S0-13…S0-18.
import { checkId, hashRecord, KERNEL_VERSION, refused, type Record, type Result } from "../kernel/index.js";
import type { Commit, Evidence } from "./commit.js";
import type { ActSource } from "./ports/acts.js";
import { proposalHash, type Intent, type Proposal } from "./proposal.js";
import type { View } from "./view.js";

/** The land session and the acts landing formed (LG-22); the session's `at` is the time of landing. */
export type LandActs = {
  readonly session: { readonly id: string; readonly at: string };
  readonly events: readonly ActSource[];
};

function recordOf(before: View, proposal: Proposal, i: Intent): Record {
  const head = { id: i.id, type: i.type, hash: hashRecord(i.type, i.body), by: proposal.session.id, at: i.at, body: i.body };
  return i.op === "entity" ? { ...head, rev: (before.current(i.id)?.rev ?? 0) + 1 } : head;
}

/** LG-15: assigns `seq`, `rev` and `hash`; landing fills `prev`, `request` and `sig` (G-14). */
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
    records: proposal.intents.map((i) => recordOf(before, proposal, i)),
  };
}

/** Phase 1, Record: the id of every intent (KR-06). */
const phaseRecord = (p: Proposal) => p.intents.flatMap((i) => checkId(i.op, i.id, { intent: i.id, path: "/id" }));

export const apply: (before: View, proposal: Proposal, acts: LandActs, evidence: readonly Evidence[]) => Result<Commit> = (
  before,
  proposal,
  acts,
) => refused<Commit>(phaseRecord(proposal)) ?? { ok: true, value: candidate(before, proposal, acts) };
