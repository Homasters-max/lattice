// The `store` port of `knowledge` (LG-02; its `runtime` part is S1). Adapters:
// `memory` and `jsonl`. The adapter knows neither canon nor the meaning of a
// row: the ledger hands it each commit as its canonical line and folds the
// rows (LG-35). The exact types arrive with S0-11.
import type { Evidence } from "../commit.js";
import type { Delta, Row } from "../rows.js";

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
  /** The lines of the chain from `seq` on, in order; `seq` is dense from 1 (LG-04). */
  commits(from: number): AsyncIterable<string>;
  /** The line of the last commit. */
  tail(): Promise<string | null>;
  /** The row that holds now for a key. */
  row(key: string): Promise<Row | null>;
  /** The rows that hold now, whose key starts with `prefix`, in key order. */
  rows(prefix: string): AsyncIterable<Row>;
  /** The bytes of a cited evidence file, opaque in S0. */
  evidence(hash: string): Promise<Uint8Array | null>;
}
