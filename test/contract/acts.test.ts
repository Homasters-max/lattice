// ST-07: one set of contract tests for the `acts` port (TR-14, TR-16), run
// against every adapter of S0: `local`, `init`, `fixture` and `recorded`. Each
// adapter is given one act on the change request `cr/a` and none on `cr/b`;
// every act it reads is the body of an `act` event its type admits (TY-Z05).
import { afterAll, describe, expect, it } from "vitest";
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import { createActsInit } from "../../src/adapters/acts-init/index.js";
import { createActsLocal } from "../../src/adapters/acts-local/index.js";
import { createActsRecorded } from "../../src/adapters/acts-recorded/index.js";
import { checkAgainstType, parseJson, rejectionsOf, ROOT } from "../../src/kernel/index.js";
import { ACT_TYPE, apply, createView, readProposal, type Act, type Acts, type Commit } from "../../src/ledger/index.js";
import { std } from "../ledger/std-sources.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { proposal } from "../support/landing.js";
import { identityOf, publicKeyOf, SIGNED_AT, signedRepo, type SignedRepo } from "../support/signed-git.js";

const HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const AT = "2026-10-06T12:00:00.000000Z";
const ACT: Act = { verb: "approve", target: HASH, identity: "ssh:SHA256:/qeQPvSZ++WtdXC/R1N0hRnV2NWTE7niYmvBePEWsDk", uri: "fixture:cr/a", at: AT, verified: true };

const repos: SignedRepo[] = [];
afterAll(() => repos.forEach((r) => r.remove()));

/** A commit landing formed for a proposal of `cr/a`, holding `acts` as `act` events (TR-16). */
function landedWith(acts: readonly Act[]): Commit {
  const value = parseJson(proposal("demo/a"));
  const read = value.ok ? readProposal(value.value) : value;
  if (!read.ok) throw new Error("bug: the proposal of the tests has the form of LG-09");
  const events = acts.map((body, i) => ({ id: `01JB2X000000000000000ACT0${i}`, at: AT, body }));
  const land = deepFreeze({ session: { id: "01JB2X00000000000000000LND", at: AT }, events });
  const applied = apply(deepFreeze(createView(0, [])), deepFreeze(read.value), land, deepFreeze([]));
  if (!applied.ok || applied.value === "no-op") throw new Error("bug: the proposal of the tests lands");
  return applied.value;
}

/** `cr/a`: a commit signed by the key of the policy with the trailer of one act; `cr/b`: a signed commit without one. */
function localRepo(): { readonly acts: Acts; readonly expected: readonly Act[] } {
  const repo = signedRepo();
  repos.push(repo);
  repo.commit("main", "start", null);
  repo.branch("cr/a", "main");
  repo.branch("cr/b", "main");
  const id = repo.commit("cr/a", `approve the proposal\n\nLattice-Act: approve ${HASH}\n`, "dev-owner");
  repo.commit("cr/b", "only code\n", "dev-owner");
  const acts = createActsLocal(deepFreeze({ dir: repo.dir, base: "main", keys: [publicKeyOf("dev-owner")] }));
  return { acts, expected: [{ verb: "approve", target: HASH, identity: identityOf("dev-owner"), uri: `git:${id}`, at: SIGNED_AT, verified: true }] };
}

const INIT = { identity: ACT.identity, uri: "file:///project/store/lattice.json", at: AT };

const ADAPTERS: readonly { readonly name: string; readonly make: () => { readonly acts: Acts; readonly expected: readonly Act[] } }[] = [
  { name: "acts-fixture", make: () => ({ acts: createActsFixture(deepFreeze({ acts: { "cr/a": [ACT] } })), expected: [ACT] }) },
  {
    name: "acts-init",
    make: () => ({ acts: createActsInit(deepFreeze({ ...INIT, proposals: { "cr/a": HASH } })), expected: [{ verb: "approve", target: HASH, ...INIT, verified: true }] }),
  },
  { name: "acts-recorded", make: () => ({ acts: createActsRecorded(deepFreeze({ commits: { "cr/a": landedWith([ACT]) } })), expected: [ACT] }) },
  { name: "acts-local", make: localRepo },
];

describe.each(ADAPTERS)("acts port: $name", ({ make }) => {
  it("ST-07, TR-14: reads the acts of a change request, and none of one without acts", async () => {
    const { acts, expected } = make();
    expect(await acts.read("cr/a")).toEqual(expected);
    expect(await acts.read("cr/b")).toEqual([]);
  });

  it("TR-16: every act is the body of an act event its type admits, with the result of its check", async () => {
    const { acts } = make();
    for (const act of await acts.read("cr/a")) {
      expect(rejectionsOf(checkAgainstType({ type: ACT_TYPE, body: act }, std().resolve, ROOT))).toEqual([]);
    }
  });

  it("TR-16: a second read of a change request gives the same acts", async () => {
    const { acts } = make();
    expect(await acts.read("cr/a")).toEqual(await acts.read("cr/a"));
  });
});
