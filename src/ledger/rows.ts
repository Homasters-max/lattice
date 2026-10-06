// Rows and deltas (LG-35): a row is canonical JSON with `from` and `to`, the
// `seq` that opened and closed it; `to` is `null` while it holds. The key
// schema of rows arrives with S0-12.
import type { JsonValue } from "../kernel/index.js";

export type Row = {
  readonly key: string;
  readonly from: number;
  readonly to: number | null;
  readonly value: JsonValue;
};

/** The rows one commit opens and closes. */
export type Delta = readonly Row[];

const order = (a: Row, b: Row) => (a.key === b.key ? a.from - b.from : a.key < b.key ? -1 : 1);

/** Rows by key, then by `from`; keys compare by UTF-16 code units (CONVENTIONS.md §5). */
export const sortRows = (rows: readonly Row[]): Row[] => [...rows].sort(order);
