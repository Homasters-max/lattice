// The `store` port of `knowledge` (LG-02; its `runtime` part is S1). Adapters:
// `memory` and `jsonl`; the meaning of every row comes from fold, never from
// the adapter (LG-35). The exact types arrive with S0-11.
import type { Commit, Evidence } from "../commit.js";
import type { Delta, Row } from "../rows.js";

export type { Commit, Delta, Evidence, Row };

export interface Store {
  /** Writes a commit, the delta it folds to and the evidence it cites, atomically. */
  append(commit: Commit, delta: Delta, evidence: readonly Evidence[]): Promise<void>;
  /** The chain from `seq` on, in order. */
  commits(from: number): AsyncIterable<Commit>;
  tail(): Promise<Commit | null>;
  /** The row that holds now for a key. */
  row(key: string): Promise<Row | null>;
  /** The rows that hold now, whose key starts with `prefix`, in key order. */
  rows(prefix: string): AsyncIterable<Row>;
  /** The bytes of a cited evidence file, opaque in S0. */
  evidence(hash: string): Promise<Uint8Array | null>;
}
