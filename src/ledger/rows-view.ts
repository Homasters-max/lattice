// The read view over its rows (LG-35, LG-38), inside the ledger: fold reads
// the rows behind a view, every other reader asks only the questions of View.
// The entry `ledger/view` gives the view without its rows (ST-01). The
// walking skeleton answers `seq` and `current`; the other questions arrive
// with S0-12.
import type { Record } from "../kernel/index.js";
import { currentKey, held, type Row, type Rows } from "./rows.js";

export interface View {
  readonly seq: number;
  /** The current revision of an entity (TR-22), or `null`. */
  current(id: string): Record | null;
}

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater. */
export function viewOf(seq: number, rows: readonly Row[]): View & Rows {
  const holding = held(rows, seq);
  const row = (key: string) => holding.get(key) ?? null;
  // A current row holds the record fold wrote for it (fold.ts).
  return { seq, row, current: (id) => (row(currentKey(id))?.value as Record | undefined) ?? null };
}
