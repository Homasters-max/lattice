// Rows (LG-35, LG-38), one module of the ledger: a row is canonical JSON with
// `from` and `to`, the `seq` that opened and closed it; `to` is `null` while it
// holds. Here are applying a delta, the order of keys (Q-18), `view(seq)` over
// rows, and the rows a store keeps — those the ledger hands it when it opens
// the store (LG-02) and those each delta leaves (Q-27). Fold reads the rows
// behind a view; every other reader asks only the questions of View, through
// the entry `ledger/view` (ST-01). The key schema of rows and the other
// questions of View arrive with S0-12.
import { compareText, type JsonValue, type Record } from "../kernel/index.js";

export type Row = {
  readonly key: string;
  readonly from: number;
  readonly to: number | null;
  readonly value: JsonValue;
};

/** The rows one commit opens and closes. */
export type Delta = readonly Row[];

/** The rows behind a view. Fold reads them (LG-35); every other reader asks only the questions of View (LG-38). */
export interface Rows {
  /** The row that holds at the view's `seq` for a key. */
  row(key: string): Row | null;
}

/** The read view (LG-38). The walking skeleton answers `seq` and `current`; the other questions arrive with S0-12. */
export interface View {
  readonly seq: number;
  /** The current revision of an entity (TR-22), or `null`. */
  current(id: string): Record | null;
}

/** The key of the current revision of an entity. */
export const currentKey = (id: string): string => `current:${id}`;

const order = (a: Row, b: Row) => compareText(a.key, b.key) || a.from - b.from;

/** Rows by key, then by `from` (CONVENTIONS.md §5.5). */
export const sortRows = (rows: readonly Row[]): Row[] => [...rows].sort(order);

const idOf = (r: Row) => `${r.key}@${r.from}`;

/**
 * The rows after a delta: a closed row replaces the open one it closes, an opened row is added. Fold closes only a row
 * its view holds (LG-35), so a delta that closes a row the rows do not hold is a bug of the ledger, never a no-op.
 */
export function withDelta(rows: readonly Row[], delta: Delta): Row[] {
  const closed = new Map(delta.filter((r) => r.to !== null).map((r) => [idOf(r), r]));
  const held = new Set(rows.map(idOf));
  const unknown = [...closed.keys()].find((id) => !held.has(id));
  if (unknown !== undefined) throw new Error(`bug: a delta closes the row ${unknown}, which the rows do not hold`);
  const kept = rows.map((r) => closed.get(idOf(r)) ?? r);
  return sortRows([...kept, ...delta.filter((r) => r.to === null)]);
}

/** The rows that hold at `seq` — `from ≤ seq`, `to` null or greater — by key; without `seq`, the rows that hold now. */
export function held(rows: readonly Row[], seq = Number.POSITIVE_INFINITY): ReadonlyMap<string, Row> {
  return new Map(rows.filter((r) => r.from <= seq && (r.to === null || r.to > seq)).map((r) => [r.key, r]));
}

/** `view(seq)`: the rows with `from ≤ seq` and `to` null or greater. */
export function viewOf(seq: number, rows: readonly Row[]): View & Rows {
  const holding = held(rows, seq);
  const row = (key: string) => holding.get(key) ?? null;
  // A current row holds the record fold wrote for it (fold.ts).
  return { seq, row, current: (id) => (row(currentKey(id))?.value as Record | undefined) ?? null };
}

/** What `keptRows` gives an adapter: the rows handed on opening, each delta, and `row` and `rows` of the port `store`. */
export interface KeptRows {
  readonly keep: (rows: readonly Row[]) => Promise<void>;
  /** The rows after the delta of an `append`, checked now — a bug is thrown before anything is written; kept once the returned function runs. */
  readonly apply: (delta: Delta) => () => void;
  readonly row: (key: string) => Promise<Row | null>;
  readonly rows: (prefix: string) => AsyncIterable<Row>;
}

/**
 * The rows a store keeps, for its adapter (LG-02, Q-27): `keep` takes the rows the ledger folds from genesis when it
 * opens the store, `apply` the delta of each `append` — so an append stays atomic: the rows change only after the line
 * is written; `row` and `rows` answer the port, in the order of `sortRows`.
 */
export function keptRows(): KeptRows {
  let rows: readonly Row[] = [];
  return {
    keep(folded) {
      rows = folded;
      return Promise.resolve();
    },
    apply(delta) {
      const after = withDelta(rows, delta);
      return () => {
        rows = after;
      };
    },
    row: (key) => Promise.resolve(held(rows).get(key) ?? null),
    async *rows(prefix) {
      for (const row of sortRows([...held(rows).values()].filter((r) => r.key.startsWith(prefix)))) yield await Promise.resolve(row);
    },
  };
}
