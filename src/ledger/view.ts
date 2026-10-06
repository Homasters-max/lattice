// The read view (LG-38): the questions apply, the runtime, capabilities and
// checks ask at one `seq`. The walking skeleton answers `seq` and `current`;
// the other questions arrive with S0-12.
import type { Record } from "../kernel/index.js";
import type { Store } from "./ports/store.js";
import type { Row } from "./rows.js";

export interface View {
  readonly seq: number;
  /** The current revision of an entity (TR-22), or `null`. */
  current(id: string): Record | null;
}

/** A view with the rows behind it: fold reads rows, every other reader asks the questions of View. */
export interface RowView extends View {
  /** The row that holds at `seq` for a key. */
  row(key: string): Row | null;
}

/** The key of the current revision of an entity. */
export const currentKey = (id: string): string => `current:${id}`;

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater. */
export function createView(seq: number, rows: readonly Row[]): RowView {
  const holding = new Map(rows.filter((r) => r.from <= seq && (r.to === null || r.to > seq)).map((r) => [r.key, r]));
  const row = (key: string) => holding.get(key) ?? null;
  // A current row holds the record fold wrote for it (fold.ts).
  return { seq, row, current: (id) => (row(currentKey(id))?.value as Record | undefined) ?? null };
}

/** The view at the tail of a store. */
export async function readView(store: Store): Promise<RowView> {
  const rows: Row[] = [];
  for await (const r of store.rows("")) rows.push(r);
  return createView((await store.tail())?.seq ?? 0, rows);
}
