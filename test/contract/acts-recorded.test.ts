// TR-16: acts are checked once. Landing reads the acts of a change request
// through the port once and the commit it lands holds each as an `act` event
// of its land session (LG-22); `acts-recorded` reads them back from that
// commit, and whether each counts for the proposal (TR-15, TR-16) is the same
// as when landing read them from their source — `fixture` or `local`.
import { afterAll, describe, expect, it } from "vitest";
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import { createActsLocal } from "../../src/adapters/acts-local/index.js";
import { createActsRecorded } from "../../src/adapters/acts-recorded/index.js";
import { parseJson, ROOT } from "../../src/kernel/index.js";
import { ACT_TYPE, coversProposal, land, NO_FACTS, proposalHash, readProposal, type Act, type Acts, type Commit } from "../../src/ledger/index.js";
import { AT, landingPortsForTests } from "../support/assembly.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { scratch, type Scratch } from "../support/files.js";
import { proposal } from "../support/landing.js";
import { publicKeyOf, signedRepo, type SignedRepo } from "../support/signed-git.js";

const FILE = proposal("demo/a");
const OTHER = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

function hashOfFile(): string {
  const value = parseJson(FILE);
  const read = value.ok ? readProposal(value.value) : value;
  if (!read.ok) throw new Error("bug: the proposal of the tests has the form of LG-09");
  return proposalHash(read.value, NO_FACTS);
}
const HASH = hashOfFile();

const dirs: Scratch[] = [];
const repos: SignedRepo[] = [];
afterAll(() => [...dirs, ...repos].forEach((d) => d.remove()));

const fixtureAct = (target: string, verified: boolean): Act => ({ verb: "approve", target, identity: "ssh:SHA256:/qeQPvSZ++WtdXC/R1N0hRnV2NWTE7niYmvBePEWsDk", uri: "fixture:cr/a", at: AT, verified });

/** `cr/a` approved by a key of the policy, by the same key for another proposal, and by a key the policy does not list. */
function localActs(): Acts {
  const repo = signedRepo();
  repos.push(repo);
  repo.commit("main", "start", null);
  repo.branch("cr/a", "main");
  repo.commit("cr/a", `approve\n\nLattice-Act: approve ${HASH}\n`, "dev-owner");
  repo.commit("cr/a", `approve another\n\nLattice-Act: approve ${OTHER}\n`, "dev-owner");
  repo.commit("cr/a", `approve, foreign\n\nLattice-Act: approve ${HASH}\n`, "dev-land");
  return createActsLocal(deepFreeze({ dir: repo.dir, base: "main", keys: [publicKeyOf("dev-owner")] }));
}

const SOURCES: readonly { readonly name: string; readonly make: () => Acts }[] = [
  { name: "acts-fixture", make: () => createActsFixture(deepFreeze({ acts: { "cr/a": [fixtureAct(HASH, true), fixtureAct(OTHER, true), fixtureAct(HASH, false)] } })) },
  { name: "acts-local", make: localActs },
];

/** A port that counts the reads of its change requests. */
function counted(acts: Acts): { readonly port: Acts; readonly reads: string[] } {
  const reads: string[] = [];
  return { port: { read: (request) => (reads.push(request), acts.read(request)) }, reads };
}

async function landed(acts: Acts, dryRun: boolean): Promise<Commit> {
  const dir = scratch("lattice-acts-landing-");
  dirs.push(dir);
  const repository = { dir: dir.dir, branches: { main: { files: { "README.md": "demo\n" } }, "cr/a": { from: "main", files: { "store/proposals/cr-a.json": FILE } } } };
  const out = await land(landingPortsForTests(repository, { acts }), "cr/a", { dryRun });
  if (out.outcome !== "commit") throw new Error(`bug: the change request of the tests lands; it ended ${out.outcome}`);
  return out.commit;
}

const decisions = (acts: readonly Act[]) => acts.map((a) => coversProposal(a, HASH, ROOT)).map((r) => (r.ok ? "counts" : r.rejections.map((x) => x.rule)));

describe.each(SOURCES)("acts read once, from $name", ({ make }) => {
  it("TR-16, LG-22: landing reads the acts once and the commit holds each as an act event of the land session", async () => {
    const source = make();
    const { port, reads } = counted(source);
    const commit = await landed(port, false);
    const events = commit.records.filter((r) => r.type === ACT_TYPE);
    expect(reads).toEqual(["cr/a"]);
    expect(events.map((e) => [e.by, e.at])).toEqual([0, 1, 2].map(() => [commit.by, commit.at]));
    expect(events.map((e) => e.body)).toEqual(await source.read("cr/a"));
  });

  it("TR-16: the act events landing wrote, read through recorded, are the acts of the source and give the same decisions", async () => {
    const source = make();
    const commit = await landed(source, true);
    const recorded = await createActsRecorded(deepFreeze({ commits: { "cr/a": commit } })).read("cr/a");
    const read = await source.read("cr/a");
    expect(recorded).toEqual(read);
    expect(decisions(recorded)).toEqual(decisions(read));
    expect(decisions(recorded)).toEqual(["counts", ["TR-15"], ["TR-16"]]);
  });
});
