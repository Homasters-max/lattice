// Fold and the read view (LG-34…LG-39, LG-41, RF-09): the projections of S0
// that fold writes as rows — the current and latest revision and each
// revision, referrers by references and external links, the holder of a
// unique key and the evidence a commit cites — and every question of the view
// over them, at the tail and at any earlier `seq`. Fold is total: it folds what
// apply would refuse as it is.
import { describe, expect, it } from "vitest";
import { canon, hashBytes, type JsonValue } from "../../src/kernel/index.js";
import { commitLine, fold, openLines, type Commit, type Evidence, type Folded } from "../../src/ledger/index.js";
import { viewOf, withDelta, type Row } from "../../src/ledger/rows.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { note, proposalOf, seen, TYPES } from "../support/notes.js";

const EVENT = "01JB2X0000000000000000SEEN";

/** The store of these proposals, landed and opened from genesis (LG-02). */
function opened(proposals: readonly JsonValue[]): Folded & { readonly commits: readonly Commit[] } {
  const commits = deepFreeze(landedChain(proposals));
  const out = openLines(commits.map(commitLine), keyOfLand);
  if (!out.ok) throw new Error(`bug: a landed chain opens: ${JSON.stringify(out.rejections)}`);
  return { ...out.value, commits };
}

/** Types and two notes in one commit (LG-11); demo/b cites demo/a; then demo/b again, citing demo/c; then an event about demo/a. */
const STORE = opened([
  proposalOf(...TYPES, note("demo/a", { source: "https://example.org/a" }), note("demo/b", { refs: ["demo/a", "demo/a@1#title"], parent: { to: "demo/a" } })),
  proposalOf(note("demo/b", { refs: ["demo/c"] }, 1), note("demo/c")),
  proposalOf(seen(EVENT, "demo/a")),
]);

const pairs = (rows: readonly { readonly source: string; readonly path: string; readonly label: string | null }[]) => rows.map((r) => [r.source, r.path, r.label]);

describe("the projections of S0 (LG-34, LG-35)", () => {
  it("LG-35: every row is canonical JSON with from and to, and a delta is sorted by key", () => {
    for (const row of STORE.rows) expect(canon(row)).toMatchObject({ ok: true });
    const [, second] = STORE.commits as [Commit, Commit];
    const delta = fold(STORE.viewAt(1)!, second, []);
    expect(delta.map((r) => r.key)).toEqual([...delta.map((r) => r.key)].sort());
  });

  it("LG-38: current, latest and revision return the record (TR-22)", () => {
    const { view } = STORE;
    expect([view.current("demo/b")?.rev, view.latest("demo/b")?.rev, view.revision("demo/b", 1)?.body, view.revision("demo/b", 3)]).toEqual([
      2,
      2,
      { title: "demo/b", refs: ["demo/a", "demo/a@1#title"], parent: { to: "demo/a" } },
      null,
    ]);
    expect([view.current("demo/x"), view.latest("demo/x"), view.revision("demo/note", 1)?.type]).toEqual([null, null, "core/type@1"]);
  });

  it("RF-09: referrers index references with their label, external links and the edges of a $ref target, and close those of a revision that is no longer current", () => {
    const at1 = STORE.viewAt(1)!;
    // By key: the canonical JSON of [target, label, source, path] — a label string before null.
    expect(pairs(at1.referrers("demo/a"))).toEqual([
      ["demo/b@1", "/refs/0", "cites"],
      ["demo/b@1", "/refs/1", "cites"],
      ["demo/b@1", "/parent/to", null],
    ]);
    expect(at1.referrers("demo/a", "cites").map((r) => r.ref)).toEqual(["demo/a", "demo/a@1#title"]);
    expect(pairs(at1.referrers("demo/a", null))).toEqual([["demo/b@1", "/parent/to", null]]);
    expect(at1.referrers("https://example.org/a")).toEqual([{ target: "https://example.org/a", label: "source", source: "demo/a@1", path: "/source", ref: "https://example.org/a" }]);
    // demo/b@2 cites demo/c only: the edges of demo/b@1 hold no more.
    expect([pairs(STORE.viewAt(2)!.referrers("demo/a")), pairs(STORE.viewAt(2)!.referrers("demo/c"))]).toEqual([[], [["demo/b@2", "/refs/0", "cites"]]]);
    expect(pairs(STORE.view.referrers("demo/a"))).toEqual([[EVENT, "/of", "about"]]);
  });

  it("RF-09: referrers answer who points at an event — a reference to it by its id", () => {
    const store = opened([proposalOf(...TYPES, note("demo/a")), proposalOf(seen(EVENT, "demo/a")), proposalOf(note("demo/b", { parent: { to: EVENT } }))]);
    expect([pairs(store.view.referrers(EVENT)), store.view.referrers(EVENT).map((r) => r.ref), pairs(store.viewAt(2)!.referrers(EVENT))]).toEqual([
      [["demo/b@1", "/parent/to", null]],
      [EVENT],
      [],
    ]);
  });

  it("RF-09: a referrer that names a label no edge has, or a target nothing points at, has none", () => {
    expect([STORE.view.referrers("demo/c", "about"), STORE.view.referrers("demo/z"), STORE.view.referrers("demo/c", null)]).toEqual([[], [], []]);
  });

  it("LG-19: holder names the entity that holds a unique key in its namespace; a new revision with the same value keeps the row", () => {
    const title = (value: string) => ({ namespace: "demo", type: "demo/note", path: "/title", value });
    expect([STORE.view.holder(title("demo/a")), STORE.view.holder(title("demo/b")), STORE.view.holder(title("demo/z"))]).toEqual(["demo/a", "demo/b", null]);
    expect(STORE.view.holder({ ...title("demo/a"), namespace: "other" })).toBeNull();
    const held = STORE.rows.filter((r) => r.key.startsWith("holder:") && r.value !== null && (r.value as { id: string }).id === "demo/b");
    expect(held.map((r) => [r.from, r.to])).toEqual([[1, null]]);
  });

});

describe("blocks, standing and evidence (LG-38)", () => {
  it("LG-38: blocks gives the current revisions of the types and namespaces asked, by id", () => {
    expect(STORE.view.blocks(["demo/note"], ["demo"]).map((r) => [r.id, r.rev])).toEqual([
      ["demo/a", 1],
      ["demo/b", 2],
      ["demo/c", 1],
    ]);
    expect([STORE.view.blocks(["core/type"], ["demo"]).map((r) => r.id), STORE.view.blocks(["demo/note"], ["other"]), STORE.view.blocks([], ["demo"])]).toEqual([
      ["demo/link", "demo/note", "demo/seen"],
      [],
      [],
    ]);
  });

  it("TR-25: standing answers no reference until S0-14 writes its rows, and reads a row of standing where one holds", () => {
    expect([STORE.view.standing("demo/a"), STORE.view.standing("demo/a@1"), STORE.view.standing(EVENT), STORE.view.standing("not a ref")]).toEqual([null, null, null, null]);
    const standing = { inForce: true, basis: "asserted", use: "in-use", live: null };
    const rows: Row[] = [...STORE.rows, { key: "standing:demo/b@2", from: 2, to: null, value: standing }];
    const view = viewOf(3, deepFreeze(rows));
    expect([view.standing("demo/b"), view.standing("demo/b@2"), view.standing("demo/b@1"), view.standing("demo/x")]).toEqual([standing, standing, null, null]);
  });

  it("LG-30, LG-38: evidence gives the bytes of a file a commit up to the seq cited, by its hash; in S0 fold reads no run from it", () => {
    const file: Evidence = { hash: hashBytes(Uint8Array.from([1, 2, 255])), bytes: Uint8Array.from([1, 2, 255]) };
    const [first] = STORE.commits as [Commit];
    const delta = fold(viewOf(0, []), first, [file]);
    expect(delta.filter((r) => r.key.startsWith("evidence:"))).toEqual([{ key: `evidence:${file.hash}`, from: 1, to: null, value: { hash: file.hash } }]);
    expect([viewOf(1, deepFreeze(delta), [file]).evidence(file.hash), viewOf(0, delta, [file]).evidence(file.hash), viewOf(1, delta, []).evidence(file.hash)]).toEqual([file.bytes, null, null]);
    expect(STORE.view.evidence(file.hash)).toBeNull();
  });
});

describe("a view at any seq and the feed (LG-41)", () => {
  it("LG-41: view(seq) over the rows of the tail answers as the store of the commits up to seq", () => {
    for (let seq = 0; seq <= 3; seq++) {
      const prefix = openLines(STORE.commits.slice(0, seq).map(commitLine), keyOfLand);
      if (!prefix.ok) throw new Error("bug: a prefix of a chain opens");
      const at = STORE.viewAt(seq)!;
      const ask = (v: typeof at) => [v.seq, v.current("demo/b"), v.latest("demo/a"), v.referrers("demo/a"), v.referrers("demo/c"), v.blocks(["demo/note"], ["demo"])];
      expect(ask(at)).toEqual(ask(prefix.value.view));
    }
  });

  it("LG-41: viewAt answers only a seq of the chain; the feed gives the commits from a seq on", () => {
    expect([STORE.viewAt(-1), STORE.viewAt(4), STORE.viewAt(1.5)]).toEqual([null, null, null]);
    expect([STORE.feed(1), STORE.feed(3), STORE.feed(4), STORE.feed(0)]).toEqual([STORE.commits, STORE.commits.slice(2), [], STORE.commits]);
    // A `from` that is not an integer names no seq: the feed, like viewAt, answers null.
    expect([STORE.feed(1.5), STORE.feed(Number.NaN), STORE.feed(Number.POSITIVE_INFINITY)]).toEqual([null, null, null]);
  });

  it("GL-05: the tail of an opened store is its last commit, the view at it is the view at the tail, and each commit's base names the tail it was applied on", () => {
    expect([STORE.tail, STORE.view.seq, STORE.commits.map((c) => c.base)]).toEqual([STORE.commits[2], 3, [0, 1, 2]]);
    expect(STORE.viewAt(3)?.current("demo/b")).toEqual(STORE.view.current("demo/b"));
  });
});

/** The rows of the store of the first `n` commits. */
function rowsAt(n: number): readonly Row[] {
  const out = openLines(STORE.commits.slice(0, n).map(commitLine), keyOfLand);
  if (!out.ok) throw new Error("bug: a prefix of a chain opens");
  return out.value.rows;
}

/** A commit of these records, by hand: fold takes what apply refuses (LG-36) — raw commits for totality, never a pass case (plan/closure-check.md). */
const commitOf = (seq: number, records: readonly JsonValue[]): Commit =>
  deepFreeze({ ...(STORE.commits[0] as Commit), seq, records: records as Commit["records"] });

const NOTE = "demo/note@1";
const record = (id: string, rev: number | undefined, body: JsonValue, type = NOTE): JsonValue => ({
  id,
  ...(rev === undefined ? {} : { rev }),
  type,
  hash: "sha256:0",
  by: "01JB2X00000000000000000SES",
  at: "2026-10-06T11:00:00.000000Z",
  body,
});

/** The view at the first commit: types and demo/a, demo/b. */
const at1 = STORE.viewAt(1)!;

describe("fold is total (LG-36)", () => {
  it("LG-36: a dangling reference is folded as it is — its edge is indexed", () => {
    const delta = fold(at1, commitOf(2, [record("demo/d", 1, { title: "d", refs: ["demo/nowhere"] })]), []);
    expect(delta.map((r) => r.key)).toContain('referrers:["demo/nowhere","cites","demo/d@1","/refs/0"]');
  });

  it("LG-36: a duplicate is folded as it is — the last record of the commit holds the key, the rows of the one before close", () => {
    const delta = fold(at1, commitOf(2, [record("demo/a", 2, { title: "x", refs: ["demo/b"] }), record("demo/a", 2, { title: "y" }), record("demo/b", 1, { title: "a" })]), []);
    const view = viewOf(2, withDelta(rowsAt(1), delta));
    expect([view.current("demo/a")?.body, view.revision("demo/a", 2)?.body, view.referrers("demo/b"), view.holder({ namespace: "demo", type: "demo/note", path: "/title", value: "a" })]).toEqual([
      { title: "y" },
      { title: "y" },
      [],
      "demo/b",
    ]);
  });

  it("LG-36: a revision lower than the latest is the current one and leaves the latest; a type that is no reference is the type of no block", () => {
    const at2 = STORE.viewAt(2)!;
    const delta = fold(at2, commitOf(3, [record("demo/b", 1, { title: "old" }), record("demo/g", 1, { title: "g" }, "not a type")]), []);
    const view = viewOf(3, withDelta(rowsAt(2), delta));
    expect([view.current("demo/b")?.body, view.latest("demo/b")?.rev, view.current("demo/g")?.type]).toEqual([{ title: "old" }, 2, "not a type"]);
    expect(view.blocks(["demo/note", "not a type", ""], ["demo"]).map((r) => r.id)).toEqual(["demo/a", "demo/b", "demo/c"]);
  });

});

describe("what fold reads of a record (LG-11, LG-19)", () => {
  it("LG-11, KR-15: a type is read at its revision — one written in the same commit at another revision is not it", () => {
    const refs = { type: "array", items: { type: "string", format: "ref", ref: { to: "demo/note@1", pin: "any", label: "quotes" } } };
    const quoting = { abstract: false, kind: "entity", schema: { type: "object", properties: { title: { type: "string" }, refs }, required: ["title"] } };
    const delta = fold(at1, commitOf(2, [record("demo/note", 2, quoting, "core/type@1"), record("demo/d", 1, { title: "d", refs: ["demo/a"] })]), []);
    expect(delta.filter((r) => r.key.startsWith("referrers:")).map((r) => (r.value as { label: string }).label)).toEqual(["cites"]);
  });

  it("LG-19: uniqueness counts entities only — an event with a unique value holds nothing", () => {
    const mark = { abstract: false, kind: "event", schema: { type: "object", properties: { code: { type: "string", unique: true } }, required: ["code"] } };
    const delta = fold(at1, commitOf(2, [record("demo/mark", 1, mark, "core/type@1"), record(EVENT, undefined, { code: "x" }, "demo/mark@1")]), []);
    expect(delta.map((r) => r.key.split(":")[0])).toEqual(["current", "latest", "revision"]);
  });

  it("LG-19, LG-36: a new revision closes only the unique keys it still holds — one another entity took since stays with it", () => {
    const title = { namespace: "demo", type: "demo/note", path: "/title", value: "demo/a" };
    // demo/d takes the title of demo/a — a duplicate apply refuses (LG-36); then demo/a gets a revision with another title.
    const took = withDelta(rowsAt(1), fold(at1, commitOf(2, [record("demo/d", 1, { title: "demo/a" })]), []));
    const after = withDelta(took, fold(viewOf(2, took), commitOf(3, [record("demo/a", 2, { title: "a2" })]), []));
    expect([viewOf(2, took).holder(title), viewOf(3, after).holder(title), viewOf(3, after).holder({ ...title, value: "a2" })]).toEqual(["demo/d", "demo/d", "demo/a"]);
  });

  it("LG-38: a question with values canon refuses names a key no row holds (KR-10)", () => {
    const lone = "\ud800";
    expect([STORE.view.referrers(lone), STORE.view.referrers("demo/a", lone), STORE.view.holder({ namespace: "demo", type: "demo/note", path: "/title", value: lone })]).toEqual([[], [], null]);
  });
});

describe("fold is total on what apply refuses (LG-36)", () => {
  it("LG-36: a record of a type no one wrote, a body its type does not admit and a revision equal to the latest are folded as they are", () => {
    const delta = fold(
      at1,
      commitOf(2, [record("demo/e", 1, { anything: [1, 2] }, "demo/unknown@1"), record("demo/f", 1, "not an object"), record("demo/b", 1, { title: 7, refs: "demo/a", source: 3 })]),
      [],
    );
    // demo/b@1 again, with no value of its type: its rows change, the edges and the unique key of the one before close.
    expect(delta.filter((r) => r.to === null).map((r) => r.key)).toEqual([
      "current:demo/b",
      "current:demo/e",
      "current:demo/f",
      "latest:demo/b",
      "latest:demo/e",
      "latest:demo/f",
      "revision:demo/b@1",
      "revision:demo/e@1",
      "revision:demo/f@1",
    ]);
  });

  it("LG-35: any order of the records of a commit without duplicates folds to the same bytes", () => {
    const records = [record("demo/d", 1, { title: "d", refs: ["demo/a"] }), record("demo/a", 2, { title: "a2" }), record(EVENT, undefined, { of: "demo/d" }, "demo/seen@1")];
    const bytes = (rs: readonly JsonValue[]) => canon(fold(at1, commitOf(2, rs), []));
    expect(bytes([...records].reverse())).toEqual(bytes(records));
  });
});
