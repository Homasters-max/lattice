// TR-14, TR-15, TR-16, Q-04: what `acts-local` reads as an act, beyond the
// contract of the port. A temporary repository holds commits and tags signed
// by the dev keys (signed-git.ts): `dev-owner`, the key the policy lists, and
// `dev-land`, one it does not. Whether an act counts for a proposal is read
// from what the adapter gave (`coversProposal`), as phase 5 will read it.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createActsLocal } from "../../src/adapters/acts-local/index.js";
import { checkAgainstType, ROOT } from "../../src/kernel/index.js";
import { coversProposal, readPolicy, type Act } from "../../src/trust/index.js";
import { std } from "../ledger/std-sources.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { identityOf, publicKeyOf, SIGNED_AT, signedRepo, type SignedRepo } from "../support/signed-git.js";

const HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const OTHER = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

/** The keys of the writers of a policy that lists `dev-owner` (TR-10): the only keys `acts-local` is given. */
function keysOfPolicy(): readonly string[] {
  const body = { owner: "owner", writers: [{ participant: "owner", kind: "human", identities: [identityOf("dev-owner")], keys: [publicKeyOf("dev-owner")] }] };
  if (!checkAgainstType({ type: "std/namespace-policy@1", rev: 1, body }, std().resolve, ROOT).ok) throw new Error("bug: the policy of the tests is admitted by its type");
  const policy = readPolicy(body, ROOT);
  if (!policy.ok) throw new Error("bug: the policy of the tests reads");
  return (policy.value.writers ?? []).flatMap((w) => w.keys ?? []);
}

const approve = (target: string) => `approve the proposal\n\nLattice-Act: approve ${target}\n`;

let repo: SignedRepo;
beforeAll(() => {
  repo = signedRepo();
  repo.commit("main", "start", null);
});
afterAll(() => repo.remove());
afterEach(() => vi.unstubAllEnvs());

/** The acts of a new change request `name` off main, made of the commits `build` adds to it. */
async function actsOf(name: string, build: (branch: string) => void): Promise<readonly Act[]> {
  repo.branch(name, "main");
  build(name);
  return createActsLocal(deepFreeze({ dir: repo.dir, base: "main", keys: keysOfPolicy() })).read(name);
}

const covers = (acts: readonly Act[]) => deepFreeze(acts).map((a) => coversProposal(a, HASH, ROOT)).map((r) => (r.ok ? "counts" : r.rejections.map((x) => [x.rule, x.path])));

describe("acts-local: signatures", () => {
  it("TR-14, TR-16: a commit signed by a key of the policy with the trailer is an act, verified, that counts for the proposal it names", async () => {
    let id = "";
    const acts = await actsOf("cr/owner", (b) => (id = repo.commit(b, approve(HASH), "dev-owner")));
    expect(acts).toEqual([{ verb: "approve", target: HASH, identity: identityOf("dev-owner"), uri: `git:${id}`, at: SIGNED_AT, verified: true }]);
    expect(covers(acts)).toEqual(["counts"]);
  });

  it("TR-16: a commit signed by a key the policy does not list is an act whose check failed, and it counts for nothing", async () => {
    const acts = await actsOf("cr/foreign", (b) => repo.commit(b, approve(HASH), "dev-land"));
    expect(acts.map((a) => [a.identity, a.verified])).toEqual([[identityOf("dev-land"), false]]);
    expect(covers(acts)).toEqual([[["TR-16", "/verified"]]]);
  });

  it("TR-14: an unsigned commit with the trailer is no act", async () => {
    expect(await actsOf("cr/unsigned", (b) => repo.commit(b, approve(HASH), null))).toEqual([]);
  });

  it("TR-15: a trailer that names the hash of another proposal is an act that does not count for this one", async () => {
    const acts = await actsOf("cr/other", (b) => repo.commit(b, approve(OTHER), "dev-owner"));
    expect(acts.map((a) => [a.target, a.verified])).toEqual([[OTHER, true]]);
    expect(covers(acts)).toEqual([[["TR-15", "/target"]]]);
  });
});

/** The header `gpgsig` of a commit whose signature is `armored`: its lines continued by a leading space, as git writes them. */
const gpgsig = (armored: string) => `gpgsig ${armored.split("\n").join("\n ")}`;
const sshSignature = (bytes: readonly number[]) => `-----BEGIN SSH SIGNATURE-----\n${Buffer.from(bytes).toString("base64")}\n-----END SSH SIGNATURE-----`;
const MAGIC = [..."SSHSIG"].map((c) => c.charCodeAt(0));

describe("acts-local: what signs an act", () => {
  it("TR-14: a signature that holds no SSH key — of GPG, of another format, its key missing or cut short, or of one line before another header — makes no act", async () => {
    const key = [...Buffer.from(publicKeyOf("dev-owner").split(" ")[1] ?? "", "base64")];
    const signatures = [
      "-----BEGIN PGP SIGNATURE-----\niQ==\n-----END PGP SIGNATURE-----",
      sshSignature([..."NOTSIG".split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 1, 0, 0, 0, key.length, ...key]),
      sshSignature([...MAGIC, 0, 0, 0, 1]),
      sshSignature([...MAGIC, 0, 0, 0, 1, 0, 0, 0, 0, ...new Array<number>(10).fill(1)]),
      sshSignature([...MAGIC, 0, 0, 0, 1, 0, 0, 3, 232, 1, 2, 3, 4, 5]),
    ];
    // The one that holds the key of `dev-owner` names it, though git verifies no signature of it.
    const named = sshSignature([...MAGIC, 0, 0, 0, 1, 0, 0, 0, key.length, ...key, 0, 0, 0, 3, 103, 105, 116]);
    // A signature of one line, and after it a header of its own that holds a blob naming the key of `dev-land`: the
    // header is not of the signature, which holds no key.
    const land = [...Buffer.from(publicKeyOf("dev-land").split(" ")[1] ?? "", "base64")];
    const blob = Buffer.from([...MAGIC, 0, 0, 0, 1, 0, 0, 0, land.length, ...land, 0, 0, 0, 3, 103, 105, 116]).toString("base64");
    const oneLine = `gpgsig -----BEGIN SSH SIGNATURE-----\nx ${blob}`;
    const acts = await actsOf("cr/crafted", (b) => {
      [...signatures, named].forEach((s) => repo.crafted(b, gpgsig(s), approve(HASH)));
      repo.crafted(b, oneLine, approve(HASH));
    });
    expect(acts.map((a) => [a.identity, a.verified])).toEqual([[identityOf("dev-owner"), false]]);
  });

  it("TR-14: in a repository of SHA-256 objects a signed commit is an act too", async () => {
    const sha256 = signedRepo({ objectFormat: "sha256" });
    try {
      sha256.commit("main", "start", null);
      sha256.branch("cr/a", "main");
      const id = sha256.commit("cr/a", approve(HASH), "dev-owner");
      const acts = await createActsLocal(deepFreeze({ dir: sha256.dir, base: "main", keys: keysOfPolicy() })).read("cr/a");
      expect(acts).toEqual([{ verb: "approve", target: HASH, identity: identityOf("dev-owner"), uri: `git:${id}`, at: SIGNED_AT, verified: true }]);
    } finally {
      sha256.remove();
    }
  });

  it("CONVENTIONS.md §2.3: a change request git does not know is a failure of git, not one without acts", async () => {
    await expect(createActsLocal(deepFreeze({ dir: repo.dir, base: "main", keys: [] })).read("cr/none")).rejects.toThrow(/^git rev-list .* failed/);
  });
});

describe("acts-local: trailers, messages and tags", () => {
  it("TR-14: the commits on main are no change request's; each trailer of a commit is an act, and a verb TR-14 does not name is none", async () => {
    const acts = await actsOf("cr/many", (b) => repo.commit(b, `two acts\n\nLattice-Act: approve ${HASH}\nLattice-Act: veto ${HASH}\nLattice-Act: acknowledge signal-1\n`, "dev-owner"));
    expect(acts.map((a) => [a.verb, a.target])).toEqual([
      ["approve", HASH],
      ["acknowledge", "signal-1"],
    ]);
  });

  it("TR-14: a trailer only in the subject, or not in the last paragraph, is no act", async () => {
    const acts = await actsOf("cr/placed", (b) => {
      repo.commit(b, `Lattice-Act: approve ${HASH}`, "dev-owner");
      repo.commit(b, `subject\n\nLattice-Act: approve ${HASH}\n\nmore text\n`, "dev-owner");
    });
    expect(acts).toEqual([]);
  });

  it("TR-14: an answer holds the text of its message before the trailers", async () => {
    const acts = await actsOf("cr/answer", (b) => repo.commit(b, `Use the jsonl store.\n\nIt is enough for S0.\n\nLattice-Act: answer question-7\n`, "dev-owner"));
    expect(acts.map((a) => [a.verb, a.target, a.text])).toEqual([["answer", "question-7", "Use the jsonl store.\n\nIt is enough for S0."]]);
  });

  it("TR-14: a signed annotated tag on a commit of the change request is an act; an unsigned one, or one on main, is none", async () => {
    let tag = "";
    const acts = await actsOf("cr/tagged", (b) => {
      const head = repo.commit(b, "code\n", "dev-owner");
      tag = repo.tag("approve-tagged", head, approve(HASH), "dev-owner");
      repo.tag("unsigned-tagged", head, approve(HASH), null);
      repo.tag("approve-main", "main", approve(HASH), "dev-owner");
    });
    expect(acts).toEqual([{ verb: "approve", target: HASH, identity: identityOf("dev-owner"), uri: `git:${tag}`, at: SIGNED_AT, verified: true }]);
  });
});

describe("acts-local: the keys of the policy, not of the machine", () => {
  it("TR-16, Q-04: a key the machine allows signers by, and the policy does not list, verifies no act", async () => {
    const machine = repo.allowOnMachine("dev-land");
    // The adapter runs in the environment of a machine that names this configuration.
    vi.stubEnv("GIT_CONFIG_GLOBAL", machine.GIT_CONFIG_GLOBAL);
    const acts = await actsOf("cr/machine", (b) => repo.commit(b, approve(HASH), "dev-land"));
    expect(repo.machineVerifies("cr/machine")).toBe(true);
    expect(acts.map((a) => [a.identity, a.verified])).toEqual([[identityOf("dev-land"), false]]);
  });

  it("TR-16, G-55: a key of the policy the machine revokes still verifies its act — no key of the configuration of the machine reaches the check", async () => {
    vi.stubEnv("GIT_CONFIG_GLOBAL", repo.revokeOnMachine("dev-owner").GIT_CONFIG_GLOBAL);
    const acts = await actsOf("cr/revoked", (b) => repo.commit(b, approve(HASH), "dev-owner"));
    expect(acts.map((a) => [a.identity, a.verified])).toEqual([[identityOf("dev-owner"), true]]);
  });

  it("TR-16, G-55: a key of the policy the repository's own configuration distrusts still verifies its act — no key of that configuration reaches the check", async () => {
    const own = signedRepo();
    try {
      own.commit("main", "start", null);
      own.branch("cr/a", "main");
      own.commit("cr/a", approve(HASH), "dev-owner");
      own.distrustInRepository("dev-owner");
      expect(own.machineVerifies("cr/a")).toBe(false);
      const acts = await createActsLocal(deepFreeze({ dir: own.dir, base: "main", keys: keysOfPolicy() })).read("cr/a");
      expect(acts.map((a) => [a.identity, a.verified])).toEqual([[identityOf("dev-owner"), true]]);
    } finally {
      own.remove();
    }
  });
});
