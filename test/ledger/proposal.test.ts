// A proposal (LG-09): its closed form, its hash with intents in canonical
// order (LG-10, LG-06, G-03) and its signature by the session key (LG-10).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/kernel/index.js";
import {
  canonicalIntents,
  NO_FACTS,
  proposalHash,
  readProposal,
  signProposal,
  verifyProposal,
  type Intent,
  type KeyOf,
  type Proposal,
} from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const AT = "2026-10-06T12:00:00.000000Z";
const SESSION = { id: "01JB2X00000000000000000SES" };

const entity = (id: string): JsonValue => ({ op: "entity", id, type: "demo/note@1", expected: null, at: AT, body: { text: id } });
const event = (id: string, of = "demo/a", type = "demo/mark@1"): JsonValue => ({ op: "event", id, type, expected: null, at: AT, body: { of, value: true } });

function proposal(intents: readonly JsonValue[], sig: string | null = null): Proposal {
  const read = readProposal({ session: SESSION, intents, sig });
  if (!read.ok) throw new Error("bug: the test proposal has the form of LG-09");
  return deepFreeze(read.value);
}

const refusals = (value: JsonValue) => {
  const read = readProposal(deepFreeze(value));
  return read.ok ? [] : read.rejections.map((r) => [r.rule, r.intent, r.path]);
};

/** `demo/mark@1` is a fact keyed by `of` (TR-28); every other type is not. */
const MARKS: KeyOf = (i) => (i.type === "demo/mark@1" && typeof i.body === "object" && i.body !== null && !Array.isArray(i.body) ? { of: (i.body as { readonly of: JsonValue }).of } : null);

describe("the form of a proposal (LG-09)", () => {
  it("LG-09: a proposal holds session, intents and sig and nothing else", () => {
    expect(refusals({ session: SESSION, intents: [], sig: null, seq: 3 })).toEqual([["LG-09", null, "/seq"]]);
  });

  it("LG-09: an intent carries no by, rev, seq or hash — apply assigns those, and its by is the proposal's session", () => {
    const written = { ...(entity("demo/a") as { readonly [k: string]: JsonValue }), by: "01JB2X00000000000000000SES", rev: 1, seq: 1, hash: "sha256:00" };
    expect(refusals({ session: SESSION, intents: [written], sig: null })).toEqual([
      ["LG-09", "demo/a", "/by"],
      ["LG-09", "demo/a", "/hash"],
      ["LG-09", "demo/a", "/rev"],
      ["LG-09", "demo/a", "/seq"],
    ]);
  });

  it("LG-09: a field the form misses is refused where it is missing, from the root without an id (G-13)", () => {
    const without = (v: JsonValue, name: string) => Object.fromEntries(Object.entries(v as { readonly [k: string]: JsonValue }).filter(([k]) => k !== name));
    expect(refusals({ session: SESSION, intents: [without(entity("demo/a"), "at"), without(entity("demo/b"), "id")], sig: null })).toEqual([
      ["LG-09", null, "/intents/1/id"],
      ["LG-09", "demo/a", "/at"],
    ]);
  });

  it("LG-54: a proposal without intents has the form", () => {
    expect(refusals({ session: SESSION, intents: [], sig: null })).toEqual([]);
  });
});

describe("canonical order and the hash of a proposal (LG-06, LG-10, G-03)", () => {
  it("LG-06, G-03: entities by id, then facts by the canonical JSON of their key, then the other events by id", () => {
    const intents = proposal([
      event("01JB2X0000000000000000000A", "demo/z"),
      event("01JB2X0000000000000000000B", "demo/x", "demo/seen@1"),
      entity("demo/b"),
      event("01JB2X0000000000000000000C", "demo/y"),
      entity("demo/a"),
    ]).intents;
    const order = (keyOf: KeyOf) => canonicalIntents(intents, keyOf).map((i: Intent) => i.id);
    expect(order(MARKS)).toEqual(["demo/a", "demo/b", "01JB2X0000000000000000000C", "01JB2X0000000000000000000A", "01JB2X0000000000000000000B"]);
    expect(order(NO_FACTS)).toEqual(["demo/a", "demo/b", "01JB2X0000000000000000000A", "01JB2X0000000000000000000B", "01JB2X0000000000000000000C"]);
  });

  it("LG-10, LG-11: any order of intents gives the same hash", () => {
    const intents = [entity("demo/a"), entity("demo/b"), event("01JB2X0000000000000000000A", "demo/b"), event("01JB2X0000000000000000000B", "demo/a")];
    const expected = proposalHash(proposal(intents), MARKS);
    fc.assert(
      fc.property(fc.shuffledSubarray(intents, { minLength: intents.length }), (shuffled) => {
        expect(proposalHash(proposal(shuffled), MARKS)).toBe(expected);
      }),
    );
  });

  it("LG-10: the hash leaves out sig", () => {
    const { key } = testKey("alice");
    const unsigned = proposal([entity("demo/a")]);
    expect(proposalHash(signProposal(unsigned, key, NO_FACTS), NO_FACTS)).toBe(proposalHash(unsigned, NO_FACTS));
  });

  it("LG-10: the hash changes with a byte of an intent", () => {
    expect(proposalHash(proposal([entity("demo/a")]), NO_FACTS)).not.toBe(proposalHash(proposal([entity("demo/b")]), NO_FACTS));
  });
});

describe("the signature of a proposal (LG-10)", () => {
  const [alice, mallory] = [testKey("alice"), testKey("mallory")];

  it("LG-10: a proposal signed by its session key verifies, in any order of its intents", () => {
    const signed = signProposal(proposal([entity("demo/a"), entity("demo/b")]), alice.key, NO_FACTS);
    const reordered = proposal([entity("demo/b"), entity("demo/a")], signed.sig);
    expect(verifyProposal(signed, alice.publicKey, NO_FACTS)).toEqual([]);
    expect(verifyProposal(reordered, alice.publicKey, NO_FACTS)).toEqual([]);
  });

  it("LG-10: refuses a signature by another key, a changed proposal and no signature at /sig", () => {
    const signed = signProposal(proposal([entity("demo/a")]), mallory.key, NO_FACTS);
    const changed = proposal([entity("demo/b")], signProposal(proposal([entity("demo/a")]), alice.key, NO_FACTS).sig);
    const paths = (p: Proposal) => verifyProposal(p, alice.publicKey, NO_FACTS, "/store/proposals/cr.json").map((r) => [r.rule, r.intent, r.path]);
    for (const p of [signed, changed, proposal([entity("demo/a")])]) expect(paths(p)).toEqual([["LG-10", null, "/store/proposals/cr.json/sig"]]);
  });

  it("LG-10: the rejection names the hash and the key the signature was expected of", () => {
    const p = proposal([entity("demo/a")]);
    const [rejection] = verifyProposal(p, alice.publicKey, NO_FACTS);
    expect(rejection?.expected).toEqual({ hash: proposalHash(p, NO_FACTS), key: alice.publicKey });
    expect(rejection?.got).toBeNull();
  });

  it("LG-54: a proposal without intents is signed and verified as any other", () => {
    const signed = signProposal(proposal([]), alice.key, NO_FACTS);
    expect(verifyProposal(signed, alice.publicKey, NO_FACTS)).toEqual([]);
  });
});
