// `store-memory` (LG-02): the store of tests. It keeps the lines of commits as
// bytes, the rows the ledger hands it and evidence; it never parses a line and
// gives no row a meaning (LG-35).
import { sortRows, type Append, type Row, type Store } from "../../ledger/ports/store.js";

async function* stream<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) yield await Promise.resolve(item);
}

/** The rows that hold after a delta, as a new map: a closed row leaves, an opened one takes its key. */
function held(holding: ReadonlyMap<string, Row>, delta: readonly Row[]): Map<string, Row> {
  const after = new Map(holding);
  for (const row of delta) {
    if (row.to === null) after.set(row.key, row);
    else if (after.get(row.key)?.from === row.from) after.delete(row.key);
  }
  return after;
}

export function createStoreMemory(): Store {
  const lines: Uint8Array[] = [];
  let holding: ReadonlyMap<string, Row> = new Map();
  const evidence = new Map<string, Uint8Array>();
  return {
    append({ commit, delta, evidence: cited }: Append) {
      lines.push(new TextEncoder().encode(commit));
      holding = held(holding, delta);
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
