// `store-memory` (LG-02): the store of tests. It keeps the lines of commits as
// bytes, the rows the ledger hands it and those of each delta, and evidence;
// it never parses a line and gives no row a meaning (LG-35).
import { keptRows, type Append, type Store } from "../../ledger/ports/store.js";

export function createStoreMemory(): Store {
  const lines: Uint8Array[] = [];
  const rows = keptRows();
  const evidence = new Map<string, Uint8Array>();
  return {
    append({ commit, delta, evidence: cited }: Append) {
      // Atomic: a delta the rows refuse is a bug, thrown before anything is written — as the rejection of the append.
      return new Promise<void>((resolve) => {
        const hold = rows.apply(delta);
        for (const e of cited) evidence.set(e.hash, e.bytes.slice());
        lines.push(commit.slice());
        hold();
        resolve();
      });
    },
    commits: async function* (from) {
      for (const line of lines.slice(Math.max(from, 1) - 1)) yield await Promise.resolve(line);
    },
    tail: () => Promise.resolve(lines.at(-1) ?? null),
    keep: rows.keep,
    row: rows.row,
    rows: rows.rows,
    evidence: (hash) => Promise.resolve(evidence.get(hash) ?? null),
  };
}
