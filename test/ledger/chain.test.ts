// The chain of `knowledge` commits (LG-04, LG-05, LG-06): `seq` dense from 1,
// `prev` the hash of the previous commit, `at` never decreasing and every
// commit signed by its land session over its hash, computed without `sig`.
// A broken commit here is the input of a refusal only (Q-23).
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/kernel/index.js";
import { commitHash, signCommit, verifyChain, type Commit } from "../../src/ledger/index.js";
import { landedChain, LAND_KEY, keyOfLand } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const ROOT = "/store/knowledge.jsonl";

const proposal = (id: string): JsonValue => ({
  session: { id: "01JB2X00000000000000000SES" },
  intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: "2026-10-06T11:00:00.000000Z", body: { text: id } }],
  sig: null,
});

const chain = (): Commit[] => deepFreeze(landedChain([proposal("demo/a"), proposal("demo/b"), proposal("demo/c")]));

const refusals = (commits: readonly Commit[]) => verifyChain(deepFreeze(commits), keyOfLand, ROOT).map((r) => [r.rule, r.path]);

/** The chain with commit `n` (from 1) replaced. */
const withCommit = (commits: readonly Commit[], n: number, c: Commit) => commits.map((old, i) => (i === n - 1 ? c : old));

/** Commit `n` with fields set — as a broken store holds it — and signed again by the land session. */
const resigned = (commits: readonly Commit[], n: number, fields: Partial<Commit>) =>
  withCommit(commits, n, signCommit({ ...commits[n - 1]!, ...fields }, LAND_KEY.key));

describe("the chain of knowledge commits (LG-04, LG-05, LG-06)", () => {
  it("LG-04, LG-05, LG-06: a chain landing forms verifies — and the empty store too", () => {
    expect(refusals(chain())).toEqual([]);
    expect(refusals([])).toEqual([]);
  });

  it("LG-05: each commit carries the hash of the previous one, computed without sig", () => {
    const [first, second] = chain();
    expect(first!.prev).toBeNull();
    expect(second!.prev).toBe(commitHash(first!));
    expect(commitHash({ ...first!, sig: null })).toBe(commitHash(first!));
  });

  it("LG-04: refuses a hole in seq and a seq that does not start at 1", () => {
    expect(refusals(resigned(chain(), 3, { seq: 4 }))).toEqual([["LG-04", `${ROOT}/3/seq`]]);
    const [first] = chain();
    expect(refusals(resigned([first!], 1, { seq: 2 }))).toEqual([["LG-04", `${ROOT}/1/seq`]]);
  });

  it("LG-05: refuses a broken prev, and a genesis commit with one", () => {
    expect(refusals(resigned(chain(), 3, { prev: `sha256:${"0".repeat(64)}` }))).toEqual([["LG-05", `${ROOT}/3/prev`]]);
    expect(refusals(resigned(chain(), 1, { prev: `sha256:${"0".repeat(64)}` }))).toEqual([
      ["LG-05", `${ROOT}/1/prev`],
      ["LG-05", `${ROOT}/2/prev`],
    ]);
  });

  it("LG-05, LG-06: a changed byte of a record breaks the signature of its commit and the prev of the next", () => {
    const commits = chain();
    const [record] = commits[0]!.records;
    const changed = { ...commits[0]!, records: [{ ...record!, body: { text: "demo/A" } }] };
    expect(refusals(withCommit(commits, 1, changed))).toEqual([
      ["LG-06", `${ROOT}/1/sig`],
      ["LG-05", `${ROOT}/2/prev`],
    ]);
    // Signed again by the land key, the changed commit still breaks the chain after it.
    expect(refusals(resigned(commits, 1, { records: changed.records }))).toEqual([["LG-05", `${ROOT}/2/prev`]]);
  });

  it("LG-06: refuses an at earlier than the predecessor's, and takes an equal one", () => {
    expect(refusals(resigned(chain(), 3, { at: "2026-10-06T11:59:59.999999Z" }))).toEqual([["LG-06", `${ROOT}/3/at`]]);
    const [first, second] = chain();
    expect(first!.at).toBe(second!.at);
  });

});

describe("the signatures of knowledge commits (LG-06)", () => {
  it("LG-06: refuses a commit signed by another key, one not signed and one of a session with no known key", () => {
    const mallory = testKey("mallory");
    const commits = chain();
    expect(refusals(withCommit(commits, 3, signCommit(commits[2]!, mallory.key)))).toEqual([["LG-06", `${ROOT}/3/sig`]]);
    expect(refusals(withCommit(commits, 3, { ...commits[2]!, sig: null }))).toEqual([["LG-06", `${ROOT}/3/sig`]]);
    expect(refusals(resigned(commits, 3, { by: "01JB2X00000000000000000XXX" }))).toEqual([["LG-06", `${ROOT}/3/sig`]]);
  });

  it("LG-06: the rejection of a signature names the hash and the key it was expected of", () => {
    const commits = chain();
    const [rejection] = verifyChain(withCommit(commits, 1, { ...commits[0]!, sig: null }), keyOfLand, ROOT);
    expect(rejection?.expected).toEqual({ hash: commitHash(commits[0]!), key: LAND_KEY.publicKey });
    expect(rejection?.got).toBeNull();
  });
});
