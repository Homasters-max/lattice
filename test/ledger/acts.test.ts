// TR-15, TR-16: whether an act covers a proposal, read from the act as landing
// wrote it — the result of the check at its source, its verb and its target —
// with every reason it does not, placed where the caller says the act sits.
import { describe, expect, it } from "vitest";
import { reject } from "../../src/kernel/index.js";
import { coversProposal, TR_15, TR_16, type Act } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const OTHER = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const ACT: Act = deepFreeze({ verb: "approve", target: HASH, identity: "github:dev", uri: "git:abc", at: "2026-10-09T12:00:00.000000Z", verified: true });
const PLACE = deepFreeze({ intent: "demo/a", path: "/acts/0" });

describe("coversProposal", () => {
  it("TR-15: an approve that names the hash of the proposal and whose check passed covers it", () => {
    expect(coversProposal(ACT, HASH, PLACE)).toEqual({ ok: true, value: ACT });
  });

  it("TR-15, TR-16: every reason an act does not cover the proposal, under the place of the act", () => {
    const act: Act = deepFreeze({ ...ACT, verb: "answer", target: OTHER, verified: false });
    expect(coversProposal(act, HASH, PLACE)).toEqual({
      ok: false,
      rejections: [
        reject(TR_15, { intent: "demo/a", path: "/acts/0/target", expected: HASH, got: OTHER }),
        reject(TR_15, { intent: "demo/a", path: "/acts/0/verb", expected: "approve", got: "answer" }),
        reject(TR_16, { intent: "demo/a", path: "/acts/0/verified", expected: true, got: false }),
      ],
    });
  });
});
