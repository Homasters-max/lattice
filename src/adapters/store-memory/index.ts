// `store-memory` (LG-02): the store of tests. It keeps commits, the rows the
// ledger hands it and evidence; it gives no row a meaning (LG-35).
import type { Commit, Delta, Evidence, Row, Store } from "../../ledger/ports/store.js";

const order = (a: Row, b: Row) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

async function* each<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield await Promise.resolve(item);
}

export function createStoreMemory(): Store {
  const commits: Commit[] = [];
  const holding = new Map<string, Row>();
  const evidence = new Map<string, Uint8Array>();
  return {
    append(commit: Commit, delta: Delta, cited: readonly Evidence[]) {
      commits.push(commit);
      for (const row of delta) {
        if (row.to === null) holding.set(row.key, row);
        else if (holding.get(row.key)?.from === row.from) holding.delete(row.key);
      }
      for (const e of cited) evidence.set(e.hash, e.bytes);
      return Promise.resolve();
    },
    commits: (from) => each(commits.filter((c) => c.seq >= from)),
    tail: () => Promise.resolve(commits.at(-1) ?? null),
    row: (key) => Promise.resolve(holding.get(key) ?? null),
    rows: (prefix) => each([...holding.values()].filter((r) => r.key.startsWith(prefix)).sort(order)),
    evidence: (hash) => Promise.resolve(evidence.get(hash) ?? null),
  };
}
