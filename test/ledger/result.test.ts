// One form of the outcome of a hard check (CONVENTIONS.md §2, §3; LG-17):
// every hard check the ledger exports returns a Result — the value it checked
// or its rejections, sorted — and takes the place where its input sits (G-13).
import { describe, expect, it } from "vitest";
import { rejectionsOf, ROOT, type JsonValue } from "../../src/kernel/index.js";
import { NO_FACTS, readProposal, signProposal, verifyChain, verifyProposal, type Proposal } from "../../src/ledger/index.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const STORE = deepFreeze({ intent: null, path: "/store/knowledge.jsonl" });
const FILE = deepFreeze({ intent: null, path: "/store/proposals/cr.json" });

const proposal = (id: string): JsonValue => ({
  session: { id: "01JB2X00000000000000000SES" },
  intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: "2026-10-06T11:00:00.000000Z", body: { text: id } }],
  sig: null,
});

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
