// The entry `ledger/view` (ST-01): the read view runtime and capabilities
// import. They ask only the questions of View, rows are never seen by them
// (LG-38), so the entry gives neither the rows nor opening a store.
import type { Row } from "./rows.js";
import { viewOf, type View } from "./rows-view.js";

export type { View };

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater, as the questions of View. */
export const createView = (seq: number, rows: readonly Row[]): View => viewOf(seq, rows);
