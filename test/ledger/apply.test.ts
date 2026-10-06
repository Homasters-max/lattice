// The thin apply of the walking skeleton: phase 1 checks ids (KR-06) and
// collects every rejection; the candidate commit carries kernel 0 (KR-03),
// the next seq, rev and hash, and the land session's `by` and `at` (LG-22).
import { describe, expect, it } from "vitest";
import { hashRecord, KERNEL_VERSION } from "../../src/kernel/index.js";
import { apply, createView, fold, readProposal, type LandActs, type Proposal } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const AT = "2026-10-06T12:00:00.000000Z";
const LAND: LandActs = deepFreeze({ session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:30:00.000000Z" }, events: [] });
const intent = (id: string, body: object = { text: id }) => ({ op: "entity", id, type: "demo/note@1", expected: null, at: AT, body });
const proposal = (...intents: object[]): Proposal =>
  deepFreeze(readProposal({ session: { id: "01JB2X00000000000000000SES" }, intents: intents as never, sig: null }));

describe("apply, phase 1 (KR-06)", () => {
  it("KR-06: collects every rejection of the phase, sorted by intent", () => {
    const out = apply(deepFreeze(createView(0, [])), proposal(intent("Z/z"), intent("demo/ok"), intent("B/b")), LAND, []);
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.intent, r.path])).toEqual([
      ["KR-06", "B/b", "/id"],
      ["KR-06", "Z/z", "/id"],
    ]);
  });
});

describe("apply, the candidate commit", () => {
  it("KR-03, LG-22: writes kernel 0, the next seq and rev, and the land session's by and at", () => {
    const out = apply(deepFreeze(createView(0, [])), proposal(intent("demo/a")), LAND, []);
    if (!out.ok) throw new Error("bug: refused");
    const { records, ...header } = out.value;
    expect(header).toMatchObject({ seq: 1, base: 0, kernel: KERNEL_VERSION, by: LAND.session.id, at: LAND.session.at, prev: null });
    expect(records).toEqual([
      { id: "demo/a", rev: 1, type: "demo/note@1", hash: hashRecord("demo/note@1", { text: "demo/a" }), by: "01JB2X00000000000000000SES", at: AT, body: { text: "demo/a" } },
    ]);
  });

  it("gives an entity the rev after its current one and folds a delta that closes the old row", () => {
    const first = apply(createView(0, []), proposal(intent("demo/a")), LAND, []);
    if (!first.ok) throw new Error("bug: refused");
    const view = createView(1, fold(createView(0, []), first.value, []));
    const second = apply(deepFreeze(view), proposal(intent("demo/a", { text: "again" })), LAND, []);
    if (!second.ok) throw new Error("bug: refused");
    expect(second.value.records.map((r) => [r.id, r.rev])).toEqual([["demo/a", 2]]);
    const delta = fold(view, second.value, []);
    expect(delta.map((r) => [r.key, r.from, r.to])).toEqual([
      ["current:demo/a", 1, 2],
      ["current:demo/a", 2, null],
    ]);
  });
});
