// The thin apply of the walking skeleton: phase 1 checks ids (KR-06) and
// collects every rejection; the candidate commit carries kernel 0 (KR-03),
// the next seq, rev and hash, the land session's `by` and `at` (LG-22), and
// its records in canonical order (LG-06, LG-10).
import { describe, expect, it } from "vitest";
import { hashRecord, KERNEL_VERSION, type JsonValue } from "../../src/kernel/index.js";
import { apply, createView, fold, proposalHash, readProposal, type Commit, type LandActs, type Proposal } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const AT = "2026-10-06T12:00:00.000000Z";
const LAND: LandActs = deepFreeze({ session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:30:00.000000Z" }, events: [] });
const intent = (id: string, body: JsonValue = { text: id }, op = "entity"): JsonValue => ({ op, id, type: "demo/note@1", expected: null, at: AT, body });

function proposal(...intents: JsonValue[]): Proposal {
  const read = readProposal({ session: { id: "01JB2X00000000000000000SES" }, intents, sig: null });
  if (!read.ok) throw new Error("bug: the test proposal has the form of LG-09");
  return deepFreeze(read.value);
}

function landed(before: ReturnType<typeof createView>, p: Proposal): Commit {
  const out = apply(before, p, LAND, []);
  if (!out.ok) throw new Error("bug: refused");
  return deepFreeze(out.value);
}

const empty = () => deepFreeze(createView(0, []));

describe("apply, phase 1 (KR-06)", () => {
  it("KR-06: collects every rejection of the phase, sorted by intent", () => {
    const out = apply(empty(), proposal(intent("Z/z"), intent("demo/ok"), intent("B/b")), LAND, []);
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.intent, r.path])).toEqual([
      ["KR-06", "B/b", "/id"],
      ["KR-06", "Z/z", "/id"],
    ]);
  });
});

describe("apply, the candidate commit", () => {
  it("KR-03, LG-22: writes kernel 0, the next seq and rev, and the land session's by and at", () => {
    const { records, ...header } = landed(empty(), proposal(intent("demo/a")));
    expect(header).toMatchObject({ seq: 1, base: 0, kernel: KERNEL_VERSION, by: LAND.session.id, at: LAND.session.at, prev: null, request: null });
    expect(records).toEqual([
      { id: "demo/a", rev: 1, type: "demo/note@1", hash: hashRecord("demo/note@1", { text: "demo/a" }), by: "01JB2X00000000000000000SES", at: AT, body: { text: "demo/a" } },
    ]);
  });

  it("LG-11, LG-35: gives an entity the rev after its current one, and fold closes the old row", () => {
    const first = landed(empty(), proposal(intent("demo/a")));
    const view = deepFreeze(createView(1, fold(empty(), first, [])));
    const second = landed(view, proposal(intent("demo/a", { text: "again" })));
    expect(second.records.map((r) => [r.id, r.rev])).toEqual([["demo/a", 2]]);
    expect(fold(view, second, []).map((r) => [r.key, r.from, r.to])).toEqual([
      ["current:demo/a", 1, 2],
      ["current:demo/a", 2, null],
    ]);
  });

  it("LG-06, LG-10: any order of intents gives the same records and proposal hash", () => {
    const event = intent("01JB2X0000000000000000EVNT", { text: "seen" }, "event");
    const [ab, ba] = [proposal(intent("demo/a"), event, intent("demo/b")), proposal(event, intent("demo/b"), intent("demo/a"))];
    expect(proposalHash(ab)).toBe(proposalHash(ba));
    expect(landed(empty(), ab).records).toEqual(landed(empty(), ba).records);
    expect(landed(empty(), ab).records.map((r) => r.id)).toEqual(["demo/a", "demo/b", "01JB2X0000000000000000EVNT"]);
  });
});
