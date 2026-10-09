// The thin apply of the walking skeleton: phase 1 checks ids (KR-06) and
// collects every rejection; the candidate commit carries kernel 0 (KR-03),
// the next seq, rev and hash, the land session's `by` and `at` (LG-22), and
// its records in canonical order (LG-06, LG-10).
import { describe, expect, it } from "vitest";
import { BODY_LIMIT, KERNEL_VERSION, type JsonValue } from "../../src/kernel/index.js";
import {
  apply,
  commitHash,
  commitLine,
  createView,
  fold,
  NO_FACTS,
  openLines,
  proposalHash,
  readProposal,
  type Commit,
  type LandActs,
  type Proposal,
} from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { hashOf } from "../support/hash-of.js";

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
  if (!out.ok || out.value === "no-op") throw new Error("bug: the test proposal applies to a commit");
  return deepFreeze(out.value);
}

const empty = () => deepFreeze(createView(0, []));

/** The read view of a store of these commits, opened from genesis (LG-02): fold reads its rows. */
function opened(commits: readonly Commit[]) {
  const out = openLines(commits.map(commitLine), null);
  if (!out.ok) throw new Error("bug: the commits of apply open as a store");
  return deepFreeze(out.value.view);
}

describe("apply, phase 1 (KR-06)", () => {
  it("KR-06: collects every rejection of the phase, sorted by intent", () => {
    const out = apply(empty(), proposal(intent("Z/z"), intent("demo/ok"), intent("B/b")), LAND, []);
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.intent, r.path])).toEqual([
      ["KR-06", "B/b", "/id"],
      ["KR-06", "Z/z", "/id"],
    ]);
  });
});

describe("apply, phase 1: canonical form and the body limit (KR-10, KR-13)", () => {
  const refusals = (p: JsonValue) => {
    const read = readProposal(deepFreeze(p));
    if (!read.ok) throw new Error("bug: the test proposal has the form of LG-09");
    const out = apply(empty(), read.value, LAND, []);
    return out.ok ? [] : out.rejections.map((r) => [r.rule, r.intent, r.path]);
  };

  it("KR-10: refuses what canon refuses — in the session and the signature from the root, in an intent inside it (G-13)", () => {
    const session = { id: "01JB2X00000000000000000SES", name: "e\u0301" };
    const p = { session, intents: [{ ...(intent("demo/a") as { readonly [k: string]: JsonValue }), expected: -0 }], sig: "\uD800" };
    expect(refusals(p)).toEqual([
      ["KR-10", null, "/session/name"],
      ["KR-10", null, "/sig"],
      ["KR-10", "demo/a", "/expected"],
    ]);
  });

  it("KR-13: refuses a body over the limit at its intent, and writes one at the limit", () => {
    const at = (bytes: number) => ({ session: { id: "01JB2X00000000000000000SES" }, intents: [intent("demo/a", "x".repeat(bytes - 2))], sig: null });
    expect(refusals(at(BODY_LIMIT + 1))).toEqual([["KR-13", "demo/a", "/body"]]);
    expect(refusals(at(BODY_LIMIT))).toEqual([]);
  });
});

describe("apply, no-op (LG-12, LG-54)", () => {
  it("LG-12, LG-54: a proposal without intents is a no-op — an empty commit is never written", () => {
    expect(apply(empty(), proposal(), LAND, [])).toEqual({ ok: true, value: "no-op" });
  });
});

describe("apply, the candidate commit", () => {
  it("KR-03, LG-22: writes kernel 0, the next seq and rev, and the land session's by and at", () => {
    const { records, ...header } = landed(empty(), proposal(intent("demo/a")));
    expect(header).toMatchObject({ seq: 1, base: 0, kernel: KERNEL_VERSION, by: LAND.session.id, at: LAND.session.at, prev: null, request: null });
    expect(records).toEqual([
      { id: "demo/a", rev: 1, type: "demo/note@1", hash: hashOf("demo/note@1", { text: "demo/a" }), by: "01JB2X00000000000000000SES", at: AT, body: { text: "demo/a" } },
    ]);
  });

  it("LG-11, LG-35: gives an entity the rev after its current one, and fold closes the old row", () => {
    const first = landed(empty(), proposal(intent("demo/a")));
    const view = opened([first]);
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
    expect(proposalHash(ab, NO_FACTS)).toBe(proposalHash(ba, NO_FACTS));
    expect(landed(empty(), ab).records).toEqual(landed(empty(), ba).records);
    expect(commitHash(landed(empty(), ab))).toBe(commitHash(landed(empty(), ba)));
    expect(landed(empty(), ab).records.map((r) => r.id)).toEqual(["demo/a", "demo/b", "01JB2X0000000000000000EVNT"]);
  });
});
