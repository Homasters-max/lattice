// The `store` port of `knowledge` (LG-02; its `runtime` part is S1). Adapters:
// `memory` and `jsonl`. The adapter knows neither canon nor the meaning of a
// row: the ledger hands it each commit as its canonical line, reads back the
// bytes of every line as the store keeps them — decoding and refusing them is
// the ledger's (KR-10) — and folds the rows (LG-35). Key order is part of the
// contract: one comparator, `sortRows`, for the ledger and every adapter (Q-18).
// The exact types arrive with S0-11.
import type { Evidence } from "../commit.js";
import type { Delta, Row } from "../rows.js";

export { sortRows } from "../rows.js";
export type { Delta, Evidence, Row };

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
