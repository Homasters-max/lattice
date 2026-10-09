// ST-07, LG-03, LG-39: the read view and the verification of a store on every
// adapter of `store`. Commits landed into a store and the store opened again
// answer every question of the view of S0 alike on `memory` and `jsonl`; a
// store verifies by the keys of the land sessions it records (LG-05, TR-11),
// and the rows it keeps are the rows its commits fold to (LG-37).
import { afterAll, describe, expect, it } from "vitest";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { createStoreMemory } from "../../src/adapters/store-memory/index.js";
import type { JsonValue } from "../../src/kernel/index.js";
import { commitLine, fold, KNOWLEDGE, openLines, openStore, verifyStore, type Commit, type Store, type View } from "../../src/ledger/index.js";
import { keyOfLand, landedChain, recordedChain } from "../support/chain.js";
import { scratch, type Scratch } from "../support/files.js";
import { note, proposalOf, seen, TYPES } from "../support/notes.js";

const dirs: Scratch[] = [];
afterAll(() => dirs.forEach((d) => d.remove()));

const ADAPTERS: readonly { readonly name: string; readonly make: () => Store }[] = [
  { name: "store-memory", make: () => createStoreMemory() },
  {
    name: "store-jsonl",
    make: () => {
      const dir = scratch("lattice-store-view-");
      dirs.push(dir);
      return createStoreJsonl({ dir: dir.dir });
    },
  },
];

const EVENT = "01JB2X0000000000000000SEEN";

const PROPOSALS: readonly JsonValue[] = [
  proposalOf(...TYPES, note("demo/a", { source: "https://example.org/a" }), note("demo/b", { refs: ["demo/a"], parent: { to: "demo/a" } })),
  proposalOf(note("demo/b", { refs: ["demo/c"] }, 1), note("demo/c")),
  proposalOf(seen(EVENT, "demo/a")),
];

/** Appends commits as landing does: each line with the delta it folds to on the store of the commits before it (LG-35). */
async function appended(store: Store, commits: readonly Commit[]): Promise<Store> {
  for (const [i, c] of commits.entries()) {
    // As landing opens the store at the tail: without signatures until S0-20 (Q-39).
    const before = openLines(commits.slice(0, i).map(commitLine), null);
    if (!before.ok) throw new Error("bug: the commits before a landed one open");
    await store.append({ commit: commitLine(c), delta: fold(before.value.view, c, []), evidence: [] });
  }
  return store;
}

const title = (value: string) => ({ namespace: "demo", type: "demo/note", path: "/title", value });

/** Every question of the read view of S0 (LG-38) — `tuple` is S1 — about this knowledge. */
const answers = (v: View) => [
  v.seq,
  ["demo/a", "demo/b", "demo/c", "demo/x"].map((id) => [v.current(id), v.latest(id), v.revision(id, 1), v.revision(id, 2)]),
  [v.referrers("demo/a"), v.referrers("demo/a", "about"), v.referrers("demo/a", null), v.referrers("demo/c", "cites"), v.referrers("https://example.org/a")],
  [v.holder(title("demo/a")), v.holder(title("demo/z"))],
  [v.standing("demo/a"), v.standing(EVENT)],
  [v.blocks(["demo/note"], ["demo"]), v.blocks(["core/type", "demo/note"], ["demo"])],
  [v.evidence("sha256:0")],
];

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

describe("the read view on every adapter (LG-03, LG-38, LG-39)", () => {
  it("LG-39: every question of the view answers alike on every adapter, at the tail and at each seq (LG-41)", async () => {
    const commits = landedChain(PROPOSALS);
    const seen: unknown[] = [];
    for (const { make } of ADAPTERS) {
      const opened = await openStore(await appended(make(), commits), keyOfLand);
      if (!opened.ok) throw new Error("bug: a landed store opens");
      const { view, viewAt, feed } = opened.value;
      seen.push([answers(view), [0, 1, 2].map((seq) => answers(viewAt(seq)!)), feed(2)]);
    }
    const [first, ...rest] = seen;
    for (const other of rest) expect(other).toEqual(first);
    // Not empty answers: demo/b@2 cites demo/c, the event points at demo/a, demo/a holds its title.
    const view = (first as [ReturnType<typeof answers>])[0];
    expect(view[3]).toEqual(["demo/a", null]);
    expect((view[2] as unknown[][]).map((r) => r.length)).toEqual([1, 1, 0, 1, 1]);
  });
});

describe("verifying a store on every adapter (RT-32, LG-05, LG-37)", () => {
  it.each(ADAPTERS)("LG-05, TR-11: a store verifies by the keys of the land sessions it records, and counts its commits and rows — $name", async ({ make }) => {
    const store = await appended(make(), recordedChain(PROPOSALS));
    expect(await verifyStore(store)).toEqual({ ok: true, value: { commits: 3, rows: (await all(store.rows(""))).length } });
    expect((await all(store.rows(""))).length).toBeGreaterThan(10);
  });

  it.each(ADAPTERS)("LG-06: a commit whose land session the store does not record has no key: each is refused — $name", async ({ make }) => {
    const out = await verifyStore(await appended(make(), landedChain(PROPOSALS.slice(0, 2))));
    // `expected` names the hash the signature covers and the key: none.
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.path, (r.expected as { readonly key: unknown }).key])).toEqual([
      ["LG-06", `/${KNOWLEDGE}/1/sig`, null],
      ["LG-06", `/${KNOWLEDGE}/2/sig`, null],
    ]);
  });

  it("LG-37: rows a store answers that are not those its commits fold to are a bug, which no input can make", async () => {
    const store = await appended(createStoreMemory(), recordedChain(PROPOSALS));
    const lying: Store = { ...store, rows: (prefix) => store.rows(prefix === "" ? "current:" : prefix) };
    await expect(verifyStore(lying)).rejects.toThrow(/^bug: .*LG-37/);
  });
});
