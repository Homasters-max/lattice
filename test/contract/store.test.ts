// ST-07, LG-03: one set of contract tests for the `store` port of
// `knowledge`, run against every adapter. The store keeps the lines the ledger
// hands it and the rows of each delta; it never parses a line.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { createStoreMemory } from "../../src/adapters/store-memory/index.js";
import type { Row, Store } from "../../src/ledger/index.js";

const dirs: string[] = [];
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-store-"));
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const ADAPTERS: readonly { readonly name: string; readonly make: () => Store }[] = [
  { name: "store-memory", make: () => createStoreMemory() },
  { name: "store-jsonl", make: () => createStoreJsonl({ dir: fresh() }) },
];

const row = (key: string, from: number, to: number | null = null): Row => ({ key, from, to, value: { key, from } });

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

describe.each(ADAPTERS)("store port: $name", ({ make }) => {
  it("ST-07: gives back the lines of commits in order, from a seq on, and the tail", async () => {
    const store = make();
    expect([await all(store.commits(1)), await store.tail()]).toEqual([[], null]);
    await store.append({ commit: '{"seq":1}', delta: [], evidence: [] });
    await store.append({ commit: '{"seq":2}', delta: [], evidence: [] });
    expect(await all(store.commits(1))).toEqual(['{"seq":1}', '{"seq":2}']);
    expect(await all(store.commits(2))).toEqual(['{"seq":2}']);
    expect(await store.tail()).toBe('{"seq":2}');
  });

  it("ST-07: holds the rows a delta opens, drops the ones it closes, and reads them by key and prefix", async () => {
    const store = make();
    await store.append({ commit: "1", delta: [row("current:b", 1), row("current:a", 1), row("other:x", 1)], evidence: [] });
    await store.append({ commit: "2", delta: [row("current:a", 1, 2), row("current:a", 2)], evidence: [] });
    expect(await store.row("current:a")).toEqual(row("current:a", 2));
    expect((await all(store.rows("current:"))).map((r) => [r.key, r.from])).toEqual([
      ["current:a", 2],
      ["current:b", 1],
    ]);
    expect(await store.row("missing")).toBeNull();
  });

  it("ST-07: keeps the evidence a commit cites, byte for byte", async () => {
    const store = make();
    const bytes = Uint8Array.from([1, 2, 255]);
    await store.append({ commit: "1", delta: [], evidence: [{ hash: "sha256:e", bytes }] });
    expect(await store.evidence("sha256:e")).toEqual(bytes);
    expect(await store.evidence("sha256:none")).toBeNull();
  });
});

describe("store-jsonl", () => {
  it("LG-23: writes one line per commit to store/knowledge.jsonl, read again from the start on opening", async () => {
    const dir = fresh();
    await createStoreJsonl({ dir }).append({ commit: '{"seq":1}', delta: [], evidence: [] });
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual(['{"seq":1}']);
  });
});
