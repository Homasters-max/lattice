// ST-07, LG-03: one set of contract tests for the `store` port of
// `knowledge`, run against every adapter. The store keeps the lines the ledger
// hands it and the rows of each delta; it never parses a line, and it gives
// the bytes of every line back as it keeps them.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const utf8 = (text: string) => new TextEncoder().encode(text);

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

describe.each(ADAPTERS)("store port: $name", ({ make }) => {
  it("ST-07: gives back the bytes of the lines of commits in order, from a seq on, and the tail", async () => {
    const store = make();
    expect([await all(store.commits(1)), await store.tail()]).toEqual([[], null]);
    await store.append({ commit: '{"seq":1}', delta: [], evidence: [] });
    await store.append({ commit: '{"seq":2,"é":"ü"}', delta: [], evidence: [] });
    expect(await all(store.commits(1))).toEqual([utf8('{"seq":1}'), utf8('{"seq":2,"é":"ü"}')]);
    expect(await all(store.commits(2))).toEqual([utf8('{"seq":2,"é":"ü"}')]);
    expect(await store.tail()).toEqual(utf8('{"seq":2,"é":"ü"}'));
  });

  it("ST-07: holds the rows a delta opens, drops the ones it closes, and reads them by key and prefix in key order", async () => {
    const store = make();
    await store.append({ commit: "1", delta: [row("current:b", 1), row("current:a", 1), row("current:Z", 1), row("other:x", 1)], evidence: [] });
    await store.append({ commit: "2", delta: [row("current:a", 1, 2), row("current:a", 2)], evidence: [] });
    expect(await store.row("current:a")).toEqual(row("current:a", 2));
    expect((await all(store.rows("current:"))).map((r) => [r.key, r.from])).toEqual([
      ["current:Z", 1],
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
  const fileIn = (bytes: Uint8Array) => {
    const dir = fresh();
    mkdirSync(join(dir, "store"));
    writeFileSync(join(dir, "store/knowledge.jsonl"), bytes);
    return dir;
  };

  it("LG-23: writes one line per commit to store/knowledge.jsonl, read again from the start on opening", async () => {
    const dir = fresh();
    await createStoreJsonl({ dir }).append({ commit: '{"seq":1}', delta: [], evidence: [] });
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual([utf8('{"seq":1}')]);
  });

  it("KR-10: decodes nothing and drops nothing — an empty line and bytes that are not UTF-8 come back as they are", async () => {
    const dir = fileIn(Uint8Array.from([0x7b, 0x7d, 0x0a, 0x0a, 0x7b, 0xff, 0x7d, 0x0a]));
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual([utf8("{}"), new Uint8Array(), Uint8Array.from([0x7b, 0xff, 0x7d])]);
  });

  it("S0-11: gives the bytes after the last line feed as a line — a cut last line, which opening refuses from S0-11", async () => {
    const dir = fileIn(utf8('{"seq":1}\n{"se'));
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual([utf8('{"seq":1}'), utf8('{"se')]);
  });
});
