// One form of the outcome of a hard check (CONVENTIONS.md §2, §3; LG-17):
// every hard check the ledger exports returns a Result — the value it checked
// or its rejections, sorted — and takes the place where its input sits (G-13).
import { describe, expect, it } from "vitest";
import { rejectionsOf, ROOT, sortRejections, type JsonValue, type Result } from "../../src/kernel/index.js";
import { NO_FACTS, readProposal, signProposal, verifyChain, verifyProposal, type Proposal } from "../../src/ledger/index.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const STORE = deepFreeze({ intent: null, path: "/store/knowledge.jsonl" });
const FILE = deepFreeze({ intent: null, path: "/store/proposals/cr.json" });
/** A place with an intent: a check builds each rejection from the place it is given, the intent too (G-13). */
const HELD = deepFreeze({ intent: "demo/held", path: "/held" });

/** A session no key is known of: every commit's `sig` is refused (LG-06). */
const NO_KEYS = () => null;

const proposal = (id: string): JsonValue => ({
  session: { id: "01JB2X00000000000000000SES" },
  intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: "2026-10-06T11:00:00.000000Z", body: { text: id } }],
  sig: null,
});

/** A refused outcome's rejections are in the order of CONVENTIONS.md §5. */
const sorted = (r: Result<unknown>): boolean => !r.ok && JSON.stringify(r.rejections) === JSON.stringify(sortRejections(r.rejections));

function read(value: JsonValue): Proposal {
  const out = readProposal(deepFreeze(value), ROOT);
  if (!out.ok) throw new Error("bug: the test proposal has the form of LG-09");
  return out.value;
}

describe("a hard check of the ledger returns a Result (CONVENTIONS.md §2, LG-17)", () => {
  it("LG-04, LG-05, LG-06: verifyChain gives the commits it verified, and refuses at the place given", () => {
    const commits = deepFreeze(landedChain([proposal("demo/a"), proposal("demo/b")]));
    expect(verifyChain(commits, keyOfLand, STORE)).toEqual({ ok: true, value: commits });
    expect(verifyChain([], keyOfLand, STORE)).toEqual({ ok: true, value: [] });
    const out = verifyChain(deepFreeze([commits[1]!, commits[0]!]), keyOfLand, STORE);
    expect(out.ok).toBe(false);
    expect(rejectionsOf(out).every((r) => r.intent === null && r.path.startsWith("/store/knowledge.jsonl/"))).toBe(true);
  });

  it("CONVENTIONS.md §5: the rejections of verifyChain come sorted — not in the order of its lines and checks", () => {
    const commits = deepFreeze(landedChain([proposal("demo/a"), proposal("demo/b")]));
    const out = verifyChain(deepFreeze([commits[1]!, commits[0]!]), NO_KEYS, STORE);
    expect(rejectionsOf(out).map((r) => [r.rule, r.path])).toEqual([
      ["LG-05", "/store/knowledge.jsonl/1/prev"],
      ["LG-04", "/store/knowledge.jsonl/1/seq"],
      ["LG-06", "/store/knowledge.jsonl/1/sig"],
      ["LG-05", "/store/knowledge.jsonl/2/prev"],
      ["LG-04", "/store/knowledge.jsonl/2/seq"],
      ["LG-06", "/store/knowledge.jsonl/2/sig"],
    ]);
    expect(sorted(out)).toBe(true);
  });

  it("LG-10: verifyProposal gives the proposal it verified, and refuses at the place given", () => {
    const alice = testKey("alice");
    const signed = deepFreeze(signProposal(read(proposal("demo/a")), alice.key, NO_FACTS));
    expect(verifyProposal(signed, alice.publicKey, NO_FACTS, FILE)).toEqual({ ok: true, value: signed });
    const out = verifyProposal(read(proposal("demo/a")), alice.publicKey, NO_FACTS, FILE);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toEqual([["LG-10", null, "/store/proposals/cr.json/sig"]]);
  });

  it("LG-09: readProposal takes a place — the root of an intent without a string id is under it", () => {
    const out = readProposal(deepFreeze({ session: { id: "01JB2X00000000000000000SES" }, intents: [{ op: "entity" }], sig: null }), FILE);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toContainEqual(["LG-09", null, "/store/proposals/cr.json/intents/0/id"]);
  });
});

describe("a hard check of the ledger takes the intent of its place too (CONVENTIONS.md §3, G-13)", () => {
  it("LG-04, LG-05, LG-06: verifyChain refuses under the place given, its intent too", () => {
    const commits = deepFreeze(landedChain([proposal("demo/a")]));
    const out = verifyChain(commits, NO_KEYS, HELD);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toEqual([["LG-06", "demo/held", "/held/1/sig"]]);
  });

  it("LG-10: verifyProposal refuses at /sig under the place given, its intent too", () => {
    const out = verifyProposal(read(proposal("demo/a")), testKey("alice").publicKey, NO_FACTS, HELD);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toEqual([["LG-10", "demo/held", "/held/sig"]]);
  });

  it("LG-09: readProposal refuses an intent without a string id under the place given, its intent too", () => {
    const out = readProposal(deepFreeze({ session: { id: "01JB2X00000000000000000SES" }, intents: [{ op: "entity" }], sig: null }), HELD);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toContainEqual(["LG-09", "demo/held", "/held/intents/0/id"]);
  });
});
