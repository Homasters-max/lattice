// `store-memory` (LG-02): the store of tests. It keeps the lines of commits as
// bytes, the rows the ledger hands it and evidence; it never parses a line and
// gives no row a meaning (LG-35).
import { sortRows, type Append, type Row, type Store } from "../../ledger/ports/store.js";

async function* stream<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield await Promise.resolve(item);
}

/** The rows that hold after a delta: a closed row leaves, an opened one takes its key. */
function hold(holding: Map<string, Row>, delta: readonly Row[]): void {
  for (const row of delta) {
    if (row.to === null) holding.set(row.key, row);
    else if (holding.get(row.key)?.from === row.from) holding.delete(row.key);
  }
}

export function createStoreMemory(): Store {
  const lines: Uint8Array[] = [];
  const holding = new Map<string, Row>();
  const evidence = new Map<string, Uint8Array>();
  return {
    append({ commit, delta, evidence: cited }: Append) {
      lines.push(new TextEncoder().encode(commit));
      hold(holding, delta);
      for (const e of cited) evidence.set(e.hash, e.bytes);
      return Promise.resolve();
    },
    commits: (from) => stream(lines.slice(Math.max(from, 1) - 1)),
    tail: () => Promise.resolve(lines.at(-1) ?? null),
    row: (key) => Promise.resolve(holding.get(key) ?? null),
    rows: (prefix) => stream(sortRows([...holding.values()].filter((r) => r.key.startsWith(prefix)))),
    evidence: (hash) => Promise.resolve(evidence.get(hash) ?? null),
  };
}
