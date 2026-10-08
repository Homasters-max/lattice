// Rows and deltas (LG-35): a row is canonical JSON with `from` and `to`, the
// `seq` that opened and closed it; `to` is `null` while it holds. The key
// schema of rows arrives with S0-12.
import { compareText, type JsonValue } from "../kernel/index.js";

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

/** The key of the current revision of an entity. */
export const currentKey = (id: string): string => `current:${id}`;

const order = (a: Row, b: Row) => compareText(a.key, b.key) || a.from - b.from;

/** Rows by key, then by `from` (CONVENTIONS.md §5.5). */
export const sortRows = (rows: readonly Row[]): Row[] => [...rows].sort(order);

/** The rows after a delta: a closed row replaces the open one it closes, an opened row is added. */
export function withDelta(rows: readonly Row[], delta: Delta): Row[] {
  const closed = new Map(delta.filter((r) => r.to !== null).map((r) => [`${r.key}@${r.from}`, r]));
  const kept = rows.map((r) => closed.get(`${r.key}@${r.from}`) ?? r);
  return sortRows([...kept, ...delta.filter((r) => r.to === null)]);
}

/** The rows that hold at `seq` — `from ≤ seq`, `to` null or greater — by key; without `seq`, the rows that hold now. */
export function held(rows: readonly Row[], seq = Number.POSITIVE_INFINITY): ReadonlyMap<string, Row> {
  return new Map(rows.filter((r) => r.from <= seq && (r.to === null || r.to > seq)).map((r) => [r.key, r]));
}
