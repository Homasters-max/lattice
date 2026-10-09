// ST-07, LG-03: one set of contract tests for the `store` port of
// `knowledge`, run against every adapter. The store keeps the lines the ledger
// hands it — the canonical bytes of each commit and a line feed — the rows of
// each delta and the rows the ledger folds when it opens the store (LG-02),
// and the evidence a commit cites; it never parses a line, and it gives the
// bytes of every line back as it keeps them. Opening a store is the ledger's:
// the lines, verified as a chain and signed (LG-05), folded into rows.
import { afterAll, describe, expect, it } from "vitest";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { createStoreMemory } from "../../src/adapters/store-memory/index.js";
import { hashBytes, type JsonValue } from "../../src/kernel/index.js";
import { commitLine, fold, KNOWLEDGE, openLines, openStore, signCommit, type Commit, type Row, type Store } from "../../src/ledger/index.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { scratch, type Scratch } from "../support/files.js";
import { testKey } from "../support/keys.js";

const dirs: Scratch[] = [];
const fresh = () => {
  const dir = scratch("lattice-store-");
  dirs.push(dir);
  return dir;
};
afterAll(() => dirs.forEach((d) => d.remove()));

const ADAPTERS: readonly { readonly name: string; readonly make: () => Store }[] = [
  { name: "store-memory", make: () => createStoreMemory() },
  { name: "store-jsonl", make: () => createStoreJsonl({ dir: fresh().dir }) },
];

const row = (key: string, from: number, to: number | null = null): Row => ({ key, from, to, value: { key, from } });
const utf8 = (text: string) => new TextEncoder().encode(text);

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

const proposal = (id: string, text = id): JsonValue => ({
  session: { id: "01JB2X00000000000000000SES" },
  intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: "2026-10-06T11:00:00.000000Z", body: { text } }],
  sig: null,
});

/** Landing's chain: demo/a, demo/b, then demo/a again — the third commit closes the row of the first. */
const CHAIN = landedChain([proposal("demo/a"), proposal("demo/b"), proposal("demo/a", "again")]);

/** An evidence file a commit cites: opaque bytes, named by their hash (LG-30). */
const EVIDENCE = { hash: hashBytes(Uint8Array.from([1, 2, 255])), bytes: Uint8Array.from([1, 2, 255]) };

/** Appends commits as landing does: each line with the delta it folds to on the rows before it (LG-35); the first cites `EVIDENCE`. */
async function appended(store: Store, commits: readonly Commit[]): Promise<void> {
  for (const [i, c] of commits.entries()) {
    const before = openLines(commits.slice(0, i).map(commitLine), keyOfLand);
    if (!before.ok) throw new Error("bug: the commits before a landed one open");
    await store.append({ commit: commitLine(c), delta: fold(before.value.view, c, []), evidence: i === 0 ? [EVIDENCE] : [] });
  }
}

/** A new store of `make` holding these lines, appended without their rows. */
async function holding(make: () => Store, lines: readonly Uint8Array[]): Promise<Store> {
  const store = make();
  for (const commit of lines) await store.append({ commit, delta: [], evidence: [] });
  return store;
}

/** The store opened by the ledger with the key of the land session; a refusal fails the test. */
async function opened(store: Store) {
  const out = await openStore(store, keyOfLand);
  if (!out.ok) throw new Error(`bug: the store does not open: ${JSON.stringify(out.rejections)}`);
  return out.value;
}

/** What a store answers through the port and the view opening gives: the same on every adapter (LG-03). */
async function answers(store: Store) {
  const { view, tail } = await opened(store);
  return {
    commits: await all(store.commits(1)),
    tail: await store.tail(),
    rows: await all(store.rows("")),
    row: await store.row("current:demo/a"),
    view: [view.seq, view.current("demo/a"), view.current("demo/b")],
    seq: tail?.seq,
    evidence: [await store.evidence(EVIDENCE.hash), await store.evidence(hashBytes(utf8("none")))],
  };
}

const refusals = (out: { readonly ok: boolean; readonly rejections?: readonly { readonly rule: string; readonly path: string }[] }) =>
  (out.rejections ?? []).map((r) => [r.rule, r.path]);

describe.each(ADAPTERS)("store port: $name", ({ make }) => {
  it("ST-07: gives back the bytes of the lines of commits in order, from a seq on, and the tail", async () => {
    const store = make();
    expect([await all(store.commits(1)), await store.tail()]).toEqual([[], null]);
    await store.append({ commit: utf8('{"seq":1}\n'), delta: [], evidence: [] });
    await store.append({ commit: utf8('{"seq":2,"é":"ü"}\n'), delta: [], evidence: [] });
    expect(await all(store.commits(1))).toEqual([utf8('{"seq":1}\n'), utf8('{"seq":2,"é":"ü"}\n')]);
    expect(await all(store.commits(2))).toEqual([utf8('{"seq":2,"é":"ü"}\n')]);
    expect(await store.tail()).toEqual(utf8('{"seq":2,"é":"ü"}\n'));
  });

  it("ST-07: holds the rows a delta opens, drops the ones it closes, and reads them by key and prefix in key order", async () => {
    const store = make();
    await store.append({ commit: utf8("1\n"), delta: [row("current:b", 1), row("current:a", 1), row("current:Z", 1), row("other:x", 1)], evidence: [] });
    await store.append({ commit: utf8("2\n"), delta: [row("current:a", 1, 2), row("current:a", 2)], evidence: [] });
    expect(await store.row("current:a")).toEqual(row("current:a", 2));
    expect((await all(store.rows("current:"))).map((r) => [r.key, r.from])).toEqual([
      ["current:Z", 1],
      ["current:a", 2],
      ["current:b", 1],
    ]);
    expect(await store.row("missing")).toBeNull();
  });

  it("LG-35: a row a delta closes without opening another holds no more — gone from row and rows", async () => {
    const store = make();
    await store.append({ commit: utf8("1\n"), delta: [row("current:a", 1), row("current:b", 1)], evidence: [] });
    await store.append({ commit: utf8("2\n"), delta: [row("current:a", 1, 2)], evidence: [] });
    expect(await store.row("current:a")).toBeNull();
    expect((await all(store.rows("current:"))).map((r) => r.key)).toEqual(["current:b"]);
  });

  // Q-27: a delta closes a row the fold of the ledger saw; one the store does not keep is a bug, never a silent no-op.
  it("LG-35: a delta that closes a row the store does not keep is a bug of the ledger, thrown", async () => {
    const store = make();
    await store.append({ commit: utf8("1\n"), delta: [row("current:a", 1)], evidence: [] });
    await expect(store.append({ commit: utf8("2\n"), delta: [row("current:b", 1, 2)], evidence: [] })).rejects.toThrow(/^bug:/);
  });

  it("ST-07: keeps the evidence a commit cites, byte for byte", async () => {
    const store = make();
    await store.append({ commit: utf8("1\n"), delta: [], evidence: [EVIDENCE] });
    expect(await store.evidence(EVIDENCE.hash)).toEqual(EVIDENCE.bytes);
    expect(await store.evidence(hashBytes(utf8("none")))).toBeNull();
  });

});

describe.each(ADAPTERS)("opening a store: $name (LG-02, LG-05)", ({ make }) => {
  it("LG-02: opening folds the lines from genesis and hands the rows to the store, which answers row and rows", async () => {
    // The commits arrive without their rows: what the store answers after opening is what the ledger handed it.
    const store = await holding(make, CHAIN.map(commitLine));
    expect(await all(store.rows(""))).toEqual([]);
    const { view, tail } = await opened(store);
    expect([view.seq, tail]).toEqual([3, CHAIN[2]]);
    expect((await store.row("current:demo/a"))?.from).toBe(3);
    expect((await all(store.rows("current:"))).map((r) => [r.key, r.from])).toEqual([
      ["current:demo/a", 3],
      ["current:demo/b", 2],
    ]);
  });

  it("LG-05, LG-06: opening verifies the chain and the signature of every commit, and refuses a broken one with its rule", async () => {
    const [first, second, third] = CHAIN as [Commit, Commit, Commit];
    const cases: readonly [readonly Commit[], readonly (readonly [string, string])[]][] = [
      [[first, { ...second, sig: null }, third], [["LG-06", `/${KNOWLEDGE}/2/sig`]]],
      [[first, signCommit(second, testKey("mallory").key), third], [["LG-06", `/${KNOWLEDGE}/2/sig`]]],
      [
        [first, third],
        [
          ["LG-05", `/${KNOWLEDGE}/2/prev`],
          ["LG-04", `/${KNOWLEDGE}/2/seq`],
        ],
      ],
    ];
    for (const [commits, expected] of cases) expect(refusals(await openStore(await holding(make, commits.map(commitLine)), keyOfLand))).toEqual(expected);
  });

  it("LG-06: opens without checking signatures only where no key of a session is given — the store at the tail until S0-20 (Q-39)", async () => {
    const [first] = CHAIN as [Commit];
    const store = await holding(make, [commitLine({ ...first, sig: null })]);
    expect((await openStore(store, null)).ok).toBe(true);
    expect(refusals(await openStore(store, keyOfLand))).toEqual([["LG-06", `/${KNOWLEDGE}/1/sig`]]);
  });

  it("KR-10: opening refuses a line that is not the canonical bytes of its commit and a line feed — never repaired", async () => {
    const [first] = CHAIN as [Commit];
    const line = commitLine(first);
    const spaced = utf8(`${new TextDecoder().decode(line.subarray(0, -1)).replace(":", ": ")}\n`);
    for (const bad of [line.subarray(0, -1), spaced, utf8("\n")]) {
      expect(refusals(await openStore(await holding(make, [line, bad]), keyOfLand))).toEqual([["KR-10", `/${KNOWLEDGE}/2`]]);
    }
  });
});

describe("store port: every adapter alike (LG-03)", () => {
  it("LG-03: the same commits landed give byte-identical commits, rows, view and evidence on every adapter", async () => {
    const seen = [];
    for (const { make } of ADAPTERS) {
      const store = make();
      await appended(store, CHAIN);
      seen.push(await answers(store));
    }
    const [first, ...rest] = seen;
    expect(first?.commits).toEqual(CHAIN.map(commitLine));
    expect(first?.row).toMatchObject({ key: "current:demo/a", from: 3, to: null });
    expect(first?.evidence).toEqual([EVIDENCE.bytes, null]);
    for (const other of rest) expect(other).toEqual(first);
  });
});

describe("store-jsonl", () => {
  const fileIn = (bytes: Uint8Array) => {
    const dir = fresh();
    dir.write(KNOWLEDGE, bytes);
    return dir.dir;
  };

  /** G-46: the file of an evidence hash `sha256:<hex>` is `sha256-<hex>.jsonl` — `:` names no file on Windows. */
  const evidenceFile = (hash: string) => `evidence/${hash.replace(":", "-")}.jsonl`;

  it("LG-23: writes the line of each commit to store/knowledge.jsonl, read again from the start on opening", async () => {
    const { dir } = fresh();
    await createStoreJsonl({ dir }).append({ commit: utf8('{"seq":1}\n'), delta: [], evidence: [] });
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual([utf8('{"seq":1}\n')]);
  });

  it("LG-02: a store opened again on its directory answers the rows the ledger folds and the evidence it wrote", async () => {
    const own = fresh();
    const first = createStoreJsonl({ dir: own.dir });
    await appended(first, CHAIN);
    const again = createStoreJsonl({ dir: own.dir });
    expect(await again.row("current:demo/b")).toBeNull();
    expect(await answers(again)).toEqual(await answers(first));
    expect(await again.row("current:demo/b")).toMatchObject({ key: "current:demo/b", from: 2, to: null });
  });

  it("LG-02: git holds the commits and the evidence, never rows — store/knowledge.jsonl is the lines byte for byte", async () => {
    const own = fresh();
    await appended(createStoreJsonl({ dir: own.dir }), CHAIN);
    expect(own.list("store", { recursive: true })).toEqual(["evidence", evidenceFile(EVIDENCE.hash), "knowledge.jsonl"]);
    expect(own.bytes(KNOWLEDGE)).toEqual(Uint8Array.from(CHAIN.flatMap((c) => [...commitLine(c)])));
    expect(own.bytes(`store/${evidenceFile(EVIDENCE.hash)}`)).toEqual(EVIDENCE.bytes);
  });

  it("KR-10: decodes nothing and drops nothing — an empty line and bytes that are not UTF-8 come back as they are", async () => {
    const dir = fileIn(Uint8Array.from([0x7b, 0x7d, 0x0a, 0x0a, 0x7b, 0xff, 0x7d, 0x0a]));
    expect(await all(createStoreJsonl({ dir }).commits(1))).toEqual([utf8("{}\n"), utf8("\n"), Uint8Array.from([0x7b, 0xff, 0x7d, 0x0a])]);
  });

  // G-17: a line of the file is the canonical bytes of a commit and a line feed; the bytes after the last one are a cut line.
  it("KR-10: gives the bytes after the last line feed as a line, and opening refuses that cut last line", async () => {
    const [first, second] = CHAIN as [Commit, Commit];
    const line = commitLine(first);
    const cut = fileIn(Uint8Array.from([...line, ...utf8('{"se')]));
    expect(await all(createStoreJsonl({ dir: cut }).commits(1))).toEqual([line, utf8('{"se')]);
    expect(refusals(await openStore(createStoreJsonl({ dir: cut }), keyOfLand))).toEqual([["KR-10", `/${KNOWLEDGE}/2`]]);
    // A whole commit without its line feed is cut too: the write of its line did not end.
    const unended = fileIn(Uint8Array.from([...line, ...commitLine(second).subarray(0, -1)]));
    expect(refusals(await openStore(createStoreJsonl({ dir: unended }), keyOfLand))).toEqual([["KR-10", `/${KNOWLEDGE}/2`]]);
  });

  it("LG-30: a hash that is no hash of KR-12 names no evidence file — never a path outside store/evidence/", async () => {
    const own = fresh();
    own.write("store/knowledge.jsonl", "x\n");
    const store = createStoreJsonl({ dir: own.dir });
    expect([await store.evidence("../knowledge"), await store.evidence("sha256:../../store/knowledge")]).toEqual([null, null]);
  });
});
