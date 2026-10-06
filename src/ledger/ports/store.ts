// The `store` port of `knowledge` (LG-02; its `runtime` part is S1). Adapters:
// `memory` and `jsonl`. The adapter knows neither canon nor the meaning of a
// row: the ledger hands it each commit as its canonical line, reads back the
// bytes of every line as the store keeps them — decoding and refusing them is
// the ledger's (KR-10) — and folds the rows (LG-35). Key order is part of the
// contract: one comparator, `sortRows`, for the ledger and every adapter
// (Q-18). So are the rows a delta leaves: an adapter keeps them in `keptRows`,
// which applies a delta the way the ledger does and answers `row` and `rows`
// (Q-27).
// The exact types arrive with S0-11.
import type { Evidence } from "../commit.js";
import { held, sortRows, withDelta, type Delta, type Row } from "../rows.js";

// Q-18: the one comparator of the port, for an adapter that orders rows itself.
export { sortRows };

/** What one `append` writes. */
export type Append = {
  /** The canonical line of the commit, made by the ledger. */
  readonly commit: string;
  /** The rows the commit opens and closes. */
  readonly delta: Delta;
  /** The evidence files it cites. */
  readonly evidence: readonly Evidence[];
};

export interface Store {
  /** Writes a commit, its delta and its evidence, atomically. */
  append(append: Append): Promise<void>;
  /** The bytes of every line of the chain from `seq` on, in order, an empty one too; `seq` is dense from 1 (LG-04). */
  commits(from: number): AsyncIterable<Uint8Array>;
  /** The bytes of the last line. */
  tail(): Promise<Uint8Array | null>;
  /** The row that holds now for a key. */
  row(key: string): Promise<Row | null>;
  /** The rows that hold now, whose key starts with `prefix`, in the order of `sortRows`. */
  rows(prefix: string): AsyncIterable<Row>;
  /** The bytes of a cited evidence file, opaque in S0. */
  evidence(hash: string): Promise<Uint8Array | null>;
}

/** What `keptRows` gives an adapter: it takes each delta, and answers `row` and `rows` of the port. */
interface KeptRows extends Pick<Store, "row" | "rows"> {
  apply(delta: Delta): void;
}

/**
 * The rows a store keeps, for its adapter (Q-27): `apply` takes the delta of each `append`; `row` and `rows`
 * answer the port. Closing a row it does not keep changes nothing until the ledger hands the rows on opening (S0-11).
 */
export function keptRows(): KeptRows {
  let rows: readonly Row[] = [];
  return {
    apply(delta) {
      rows = withDelta(rows, delta);
    },
    row: (key) => Promise.resolve(held(rows).get(key) ?? null),
    async *rows(prefix) {
      for (const row of sortRows([...held(rows).values()].filter((r) => r.key.startsWith(prefix)))) yield await Promise.resolve(row);
    },
  };
}
