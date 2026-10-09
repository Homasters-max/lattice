// The entry `ledger/view` (ST-01): the read view runtime and capabilities
// import. They ask only the questions of View, rows are never seen by them
// (LG-38), so the entry gives neither the rows nor opening a store. View is
// declared with the rows (rows.ts); every module outside the ledger takes it here.
import { viewOf, type Row, type View } from "./rows.js";

export type { View };

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater, as the questions of View and nothing else. */
export function createView(seq: number, rows: readonly Row[]): View {
  const view = viewOf(seq, rows);
  return { seq: view.seq, current: (id) => view.current(id) };
}
