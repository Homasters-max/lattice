// `store-memory` (LG-02): the store of tests. It keeps the lines of commits as
// bytes, the rows the ledger hands it and evidence; it never parses a line and
// gives no row a meaning (LG-35).
import { held, sortRows, withDelta, type Append, type Row, type Store } from "../../ledger/ports/store.js";

async function* stream<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield await Promise.resolve(item);
}

export function createStoreMemory(): Store {
  const lines: Uint8Array[] = [];
  let rows: readonly Row[] = [];
  const evidence = new Map<string, Uint8Array>();
  return {
    append({ commit, delta, evidence: cited }: Append) {
      lines.push(new TextEncoder().encode(commit));
      rows = withDelta(rows, delta);
      for (const e of cited) evidence.set(e.hash, e.bytes);
      return Promise.resolve();
    },
    commits: (from) => stream(lines.slice(Math.max(from, 1) - 1)),
    tail: () => Promise.resolve(lines.at(-1) ?? null),
    row: (key) => Promise.resolve(held(rows).get(key) ?? null),
    rows: (prefix) => stream(sortRows([...held(rows).values()].filter((r) => r.key.startsWith(prefix)))),
    evidence: (hash) => Promise.resolve(evidence.get(hash) ?? null),
  };
}
