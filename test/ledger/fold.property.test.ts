// LG-37, LG-39: folding every commit from genesis gives the same bytes as the
// rows accumulated commit by commit — on random sequences of landed commits,
// each appended to a store with the delta landing folds for it on the store
// at its tail, on every adapter of `store`; and a view at any `seq` of the
// rebuild answers as the store of the commits up to it (LG-41).
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { createStoreMemory } from "../../src/adapters/store-memory/index.js";
import { canon, type JsonValue } from "../../src/kernel/index.js";
import { commitLine, fold, openLines, openStore, type Commit, type Row, type Store, type View } from "../../src/ledger/index.js";
import { withDelta } from "../../src/ledger/rows.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { scratch, type Scratch } from "../support/files.js";
import { note, proposalOf, seen, TYPES } from "../support/notes.js";

const IDS = ["demo/a", "demo/b", "demo/c"];
const TITLES = ["one", "two", "demo/a"];

/** One intent drawn: an entity of IDS with a title, references and maybe a link, or an event about one of IDS. */
type Drawn = { readonly id: string; readonly title: string; readonly refs: readonly string[]; readonly link: boolean; readonly event: boolean };

const drawn = fc.record({
  id: fc.constantFrom(...IDS),
  title: fc.constantFrom(...TITLES),
  refs: fc.subarray([...IDS, "demo/x", "demo/a@1#title"]),
  link: fc.boolean(),
  event: fc.boolean(),
});

/** A step of a sequence: one to three intents, each on another entity. */
const step = fc.uniqueArray(drawn, { minLength: 1, maxLength: 3, selector: (d) => d.id });

/** A ULID of an event, unique to its step and place (KR-06). */
const eventId = (s: number, i: number) => `01JB2X${"0".repeat(18)}${s}${i}`;

/** The proposals of the steps, each entity intent written against the latest revision of its entity (LG-09); the types first. */
function proposalsOf(steps: readonly (readonly Drawn[])[]): JsonValue[] {
  const latest = new Map<string, number>();
  return steps.map((intents, s) => {
    const made = intents.map((d, i) => {
      if (d.event) return seen(eventId(s, i), d.id);
      const expected = latest.get(d.id) ?? null;
      latest.set(d.id, (expected ?? 0) + 1);
      return note(d.id, { title: d.title, refs: [...d.refs], ...(d.link ? { source: `https://example.org/${d.title}` } : {}) }, expected);
    });
    return proposalOf(...(s === 0 ? TYPES : []), ...made);
  });
}

const dirs: Scratch[] = [];
afterAll(() => dirs.forEach((d) => d.remove()));

const ADAPTERS: readonly { readonly name: string; readonly make: () => Store }[] = [
  { name: "store-memory", make: () => createStoreMemory() },
  {
    name: "store-jsonl",
    make: () => {
      const dir = scratch("lattice-fold-");
      dirs.push(dir);
      return createStoreJsonl({ dir: dir.dir });
    },
  },
];

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** The store of the first `n` commits, opened from genesis. */
function prefix(commits: readonly Commit[], n: number) {
  const out = openLines(commits.slice(0, n).map(commitLine), keyOfLand);
  if (!out.ok) throw new Error("bug: a prefix of a landed chain opens");
  return out.value;
}

/** Every question of the view of S0 about the entities and targets of the sequences. */
const answers = (v: View) => [
  v.seq,
  IDS.map((id) => [v.current(id), v.latest(id), v.revision(id, 1), v.revision(id, 2), v.referrers(id), v.holder({ namespace: "demo", type: "demo/note", path: "/title", value: id })]),
  TITLES.map((t) => [v.holder({ namespace: "demo", type: "demo/note", path: "/title", value: t }), v.referrers(`https://example.org/${t}`, "source")]),
  v.referrers("demo/x", "cites"),
  v.blocks(["demo/note"], ["demo"]),
];

describe("rebuild equals the accumulated rows (LG-37, LG-39)", () => {
  it.each(ADAPTERS)("LG-37: folding from genesis gives the bytes of the rows accumulated commit by commit — $name", async ({ make }) => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 5 }), async (steps) => {
        const commits = landedChain(proposalsOf(steps));
        // Accumulated: each commit appended with the delta landing folds for it on the store at its tail (LG-02, LG-35).
        const store = make();
        let accumulated: readonly Row[] = [];
        for (const [i, c] of commits.entries()) {
          const delta = fold(prefix(commits, i).view, deepFreeze(c), []);
          accumulated = withDelta(accumulated, delta);
          await store.append({ commit: commitLine(c), delta, evidence: [] });
        }
        const kept = await all(store.rows(""));
        // Rebuilt: the lines folded from genesis, the store opened again on them.
        const rebuilt = prefix(commits, commits.length);
        expect(canon(rebuilt.rows)).toEqual(canon(accumulated));
        const reopened = await openStore(store, keyOfLand);
        expect(reopened.ok).toBe(true);
        expect(canon(await all(store.rows("")))).toEqual(canon(kept));
        // LG-41: the view at any seq of the rebuild answers as the store of the commits up to it.
        for (let seq = 0; seq <= commits.length; seq++) expect(answers(rebuilt.viewAt(seq)!)).toEqual(answers(prefix(commits, seq).view));
      }),
      { numRuns: 20 },
    );
  });
});
