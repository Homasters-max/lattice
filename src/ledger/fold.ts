// Fold (LG-35): the one pure function that holds the meaning of every
// projection — `fold(view, commit, evidence) → delta`. It is total (LG-36).
// The walking skeleton folds the current revision only; the projections of
// S0 arrive with S0-12.
import type { Record } from "../kernel/index.js";
import type { Commit, Evidence } from "./commit.js";
import { sortRows, type Delta, type Row } from "./rows.js";
import { currentKey, type RowView } from "./view.js";

function current(view: RowView, seq: number, record: Record): Row[] {
  const key = currentKey(record.id);
  const opened: Row = { key, from: seq, to: null, value: record };
  const held = view.row(key);
  return held === null ? [opened] : [{ ...held, to: seq }, opened];
}

/** In S0 evidence is opaque: fold takes it and reads no run from it. */
export const fold: (view: RowView, commit: Commit, evidence: readonly Evidence[]) => Delta = (view, commit) =>
  sortRows(commit.records.flatMap((r) => (r.rev === undefined ? [] : current(view, commit.seq, r))));
