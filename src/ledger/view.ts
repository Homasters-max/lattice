// The entry `ledger/view` (ST-01): the read view runtime and capabilities
// import. They ask only the questions of View, rows are never seen by them
// (LG-38), so the entry gives neither the rows nor opening a store. View is
// declared with the rows (rows.ts); every module outside the ledger takes it
// here. View is an interface: a view composed of several — the project's fold
// and those of its libraries (LG-45, S0-22) — answers the same questions.
import type { Evidence } from "./commit.js";
import { viewOf, type Row, type View } from "./rows.js";

export type { View };

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater, and the evidence the store holds, as the questions of View and nothing else. */
export function createView(seq: number, rows: readonly Row[], evidence: readonly Evidence[] = []): View {
  const v = viewOf(seq, rows, evidence);
  return {
    seq: v.seq,
    current: (id) => v.current(id),
    latest: (id) => v.latest(id),
    revision: (id, n) => v.revision(id, n),
    referrers: (target, label) => v.referrers(target, label),
    holder: (unique) => v.holder(unique),
    standing: (ref) => v.standing(ref),
    blocks: (types, namespaces) => v.blocks(types, namespaces),
    evidence: (hash) => v.evidence(hash),
  };
}
