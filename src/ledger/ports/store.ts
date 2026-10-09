// The `store` port of `knowledge` (LG-02; its `runtime` part and `content` are
// S1). Adapters: `memory` and `jsonl`. The adapter knows neither canon nor the
// meaning of a row: the ledger hands it each commit as its line — the canonical
// bytes of the commit and a line feed (G-17) — and reads back the bytes of
// every line as the store keeps them; decoding and refusing them is the
// ledger's (KR-10). When it opens the store the ledger folds the commits from
// genesis and hands the rows to the adapter, which keeps them in memory with
// the rows of each later delta (LG-02, LG-35). Key order is part of the
// contract: one comparator, `sortRows`, for the ledger and every adapter
// (Q-18); so is `keptRows`, the rows an adapter keeps (Q-27).
import type { Evidence } from "../commit.js";
import { keptRows, sortRows, type Delta, type Row } from "../rows.js";

export { keptRows, sortRows };

/** LG-50: the path of the git copy of `knowledge` in a tree — the file `store-jsonl` writes and landing reads. */
export const KNOWLEDGE = "store/knowledge.jsonl";

/** LG-30, LG-50: the folder of the evidence files a commit of the git copy cites. */
export const EVIDENCE = "store/evidence";

/** What one `append` writes. */
export type Append = {
  /** The line of the commit, made by the ledger: its canonical bytes and a line feed. */
  readonly commit: Uint8Array;
  /** The rows the commit opens and closes. */
  readonly delta: Delta;
  /** The evidence files it cites. */
  readonly evidence: readonly Evidence[];
};

export interface Store {
  /** Writes a commit, its delta and its evidence, atomically: the evidence first, then the line in one write. */
  append(append: Append): Promise<void>;
  /**
   * The bytes of every line of the chain from `seq` on, in order, each with its line feed — an empty one too, and the
   * bytes after the last line feed, a cut line, without one; `seq` is dense from 1 (LG-04).
   */
  commits(from: number): AsyncIterable<Uint8Array>;
  /** The bytes of the last line. */
  tail(): Promise<Uint8Array | null>;
  /** Takes the rows the ledger folded from genesis when it opened the store, in place of those it kept (LG-02). */
  keep(rows: readonly Row[]): Promise<void>;
  /** The row that holds now for a key. */
  row(key: string): Promise<Row | null>;
  /** The rows that hold now, whose key starts with `prefix`, in the order of `sortRows`. */
  rows(prefix: string): AsyncIterable<Row>;
  /** The bytes of a cited evidence file, opaque in S0, by its hash (KR-12). */
  evidence(hash: string): Promise<Uint8Array | null>;
}
