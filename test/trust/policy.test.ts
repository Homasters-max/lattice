// A namespace and its policy (TR-01, TR-02, TR-05): the policy is the body of
// `<name>/namespace`, of one form — the schema of its type
// `std/namespace-policy@1`, which admits it (KR-21) — read as it is; its writer
// entries name identities (TR-09) and Ed25519 keys bound to a kind (TR-10),
// which that schema does not say; the owner of an entity is the owner of its
// namespace (GL-07), read in `before` (TR-06).
import { describe, expect, it } from "vitest";
import { reject, ROOT, type JsonValue, type Record } from "../../src/kernel/index.js";
import { namespaceId, namespaceOf, ownerOf, policyOf, readPolicy, TR_09, TR_10, type Before } from "../../src/trust/index.js";
import { check } from "../ledger/std-sources.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const ALICE = testKey("alice");
const FINGERPRINT = `ssh:SHA256:${"A".repeat(43)}`;
const TYPE = "std/namespace-policy@1";

/** Every field TR-02 names, each in its form. */
const FULL = {
  supersedes: ["demo/namespace@1"],
  owner: "alice",
  writers: [
    { participant: "alice", kind: "human", identities: ["github:alice", "gitlab:alice.a", FINGERPRINT], keys: [ALICE.publicKey], roles: ["author", "owner"] },
    { participant: "land", kind: "machine", keys: [testKey("land").publicKey], roles: ["land"], grants: ["runner"] },
    { participant: "claude", kind: "agent", identities: ["github:claude"] },
  ],
  roles: { author: { types: ["std/requirement@1"], paths: ["src/"] }, owner: {} },
  pins: { lattice: "0", libraries: [{ name: "std", version: "1", hash: `sha256:${"0".repeat(64)}` }] },
  acts: [{ match: ["std/requirement@1"], from: ["owner"], count: 1 }],
  recovery: { participants: ["bob", "carol"], count: 2 },
  delegation: ["std/implementation@1"],
  labels: { blocks: "a block blocks its target" },
  budget: { ms: 1000, tokens: 0, usd: "1.5", calls: 3 },
  quality: "demo/quality@1",
} as const;

/** The rejections of a namespace body against its type (KR-21), as phase 2 of apply gives them when it is written. */
const ofType = (body: JsonValue) => check({ type: TYPE, rev: 1, body }).map((r) => [r.rule, r.path]);

/** A body the type admits, read as its policy; a body the type refuses is no input of trust. */
function read(body: JsonValue, place = ROOT) {
  expect(ofType(body), JSON.stringify(body)).toEqual([]);
  return readPolicy(deepFreeze(body), place);
}

const refusals = (body: JsonValue) => {
  const r = read(body);
  return r.ok ? [] : r.rejections.map((x) => [x.rule, x.path]);
};

describe("namespace policy (TR-02)", () => {
  it("TR-02: reads every field of a policy its type admitted, as it is", () => {
    expect(read(FULL)).toEqual({ ok: true, value: FULL });
    expect(read({ owner: "alice" })).toEqual({ ok: true, value: { owner: "alice" } });
    expect(read({ owner: "alice", pins: { lattice: "0" } })).toEqual({ ok: true, value: { owner: "alice", pins: { lattice: "0" } } });
  });

  it("TR-02, KR-21: the form of a policy is the schema of its type — a body out of it is refused when written, by KR-21", () => {
    const cases: readonly (readonly [JsonValue, string])[] = [
      [{ writers: [] }, "/body/owner"],
      [{ owner: "alice", admins: ["bob"] }, "/body/admins"],
      [{ owner: "alice", recovery: { participants: ["bob"], count: 0 } }, "/body/recovery/count"],
      [{ owner: "alice", acts: [{ match: [], from: ["owner"] }] }, "/body/acts/0/match"],
      [{ owner: "alice", budget: { usd: "1,50" } }, "/body/budget/usd"],
      [{ owner: "alice", labels: "blocks" }, "/body/labels"],
      [{ owner: "alice", roles: [] }, "/body/roles"],
      [{ owner: "alice", writers: [{ participant: "bob", kind: "robot" }] }, "/body/writers/0/kind"],
    ];
    for (const [body, path] of cases) expect(ofType(body), path).toContainEqual(["KR-21", path]);
  });

  it("TR-02: a body its type did not admit is no input: reading one that is not an object is a bug of the caller", () => {
    expect(() => readPolicy("alice", ROOT)).toThrow(/^bug: /);
  });
});

describe("what a rejection of a writer entry names (TR-09, TR-10)", () => {
  it("TR-09, TR-10: a rejection names what the policy expected and what it got, inside the place the caller names", () => {
    const at = { intent: "demo/namespace", path: "/body" };
    const writers = [
      { participant: "alice", kind: "human", identities: ["bitbucket:alice"], keys: ["ssh-rsa AAAA"] },
      { participant: "claude", kind: "agent", keys: [ALICE.publicKey] },
    ];
    const under = (path: string) => ({ intent: "demo/namespace", path: `/body${path}` });
    expect(read({ owner: "alice", writers }, at)).toEqual({
      ok: false,
      rejections: [
        reject(TR_09, { ...under("/writers/0/identities/0"), expected: "github:<login>, gitlab:<user> or ssh:SHA256:<fingerprint>", got: "bitbucket:alice" }),
        reject(TR_10, { ...under("/writers/0/keys/0"), expected: "ssh-ed25519 <base64> [comment]", got: "ssh-rsa AAAA" }),
        reject(TR_10, { ...under("/writers/1/keys"), expected: "no key: an agent holds only its session key", got: [ALICE.publicKey] }),
      ],
    });
  });

  it("TR-09, TR-10: every writer entry is read, the rejections of each under its own place", () => {
    const writers = [
      { participant: "alice", kind: "human", identities: ["alice"] },
      { participant: "bob", kind: "human" },
      { participant: "carol", kind: "machine", keys: ["ssh-rsa AAAA"] },
    ];
    expect(refusals({ owner: "alice", writers })).toEqual([
      ["TR-09", "/writers/0/identities/0"],
      ["TR-10", "/writers/2/keys/0"],
    ]);
  });
});

describe("the kinds, identities and keys of writer entries (TR-07, TR-09, TR-10)", () => {
  it("TR-07: a writer entry is of a participant of kind human, agent or machine", () => {
    for (const kind of ["human", "agent", "machine"]) expect(refusals({ owner: "alice", writers: [{ participant: "p", kind }] })).toEqual([]);
    for (const kind of ["robot", "Human"]) expect(ofType({ owner: "alice", writers: [{ participant: "p", kind }] })).toEqual([["KR-21", "/body/writers/0/kind"]]);
  });

  it("TR-09: an identity is github:<login>, gitlab:<user> or ssh:<key fingerprint>", () => {
    const writer = (identities: string[]) => ({ owner: "alice", writers: [{ participant: "alice", kind: "human", identities }] });
    expect(refusals(writer(["github:alice", "gitlab:alice", FINGERPRINT]))).toEqual([]);
    expect(refusals(writer(["github:", "bitbucket:alice", "ssh:alice", "alice", `ssh:MD5:${"A".repeat(43)}`]))).toEqual(
      [0, 1, 2, 3, 4].map((i) => ["TR-09", `/writers/0/identities/${i}`]),
    );
  });

  it("TR-10: the keys of a writer are Ed25519 in OpenSSH format", () => {
    const writer = (keys: string[]) => ({ owner: "alice", writers: [{ participant: "alice", kind: "human", keys }] });
    expect(refusals(writer([ALICE.publicKey, `${ALICE.publicKey} alice@laptop`]))).toEqual([]);
    expect(refusals(writer(["ssh-rsa AAAAB3NzaC1yc2E", ALICE.publicKey.slice(12)]))).toEqual([
      ["TR-10", "/writers/0/keys/0"],
      ["TR-10", "/writers/0/keys/1"],
    ]);
  });

  it("TR-10, TR-12: an agent holds no permanent key", () => {
    expect(refusals({ owner: "alice", writers: [{ participant: "claude", kind: "agent", keys: [ALICE.publicKey] }] })).toEqual([["TR-10", "/writers/0/keys"]]);
    expect(refusals({ owner: "alice", writers: [{ participant: "claude", kind: "agent", keys: [] }] })).toEqual([]);
  });
});

/** A `before` that holds these namespace records by id, each of the type `type`. */
function beforeOf(records: { readonly [id: string]: JsonValue }, type = TYPE): Before {
  const held = (id: string): Record | null =>
    Object.hasOwn(records, id) ? { id, rev: 1, type, hash: `sha256:${"0".repeat(64)}`, by: "01JB2X00000000000000000SES", at: "2026-10-06T11:00:00.000000Z", body: records[id]! } : null;
  return deepFreeze({ current: held });
}

describe("namespaces and owners (TR-01, TR-05)", () => {
  it("TR-01: the namespace of an entity is the prefix of its id (KR-06); an event id has none", () => {
    expect([namespaceOf("demo/a"), namespaceOf("std/namespace"), namespaceOf("01JB2X00000000000000000SES"), namespaceOf("/a")]).toEqual(["demo", "std", null, null]);
    expect(namespaceId("demo")).toBe("demo/namespace");
  });

  it("TR-01: the policy of a namespace is the body of its namespace entity in before; none where before holds none", () => {
    const before = beforeOf({ "demo/namespace": FULL });
    expect(policyOf(before, "demo", ROOT)).toEqual({ ok: true, value: FULL });
    expect(policyOf(before, "other", ROOT)).toEqual({ ok: true, value: null });
  });

  it("TR-01, G-47: a record of another type at the id of a namespace entity is no namespace", () => {
    for (const type of ["std/clause@1", "std/namespace-policy@2", "demo/namespace-policy@1"]) {
      const before = beforeOf({ "demo/namespace": { owner: "alice" } }, type);
      expect([type, policyOf(before, "demo", ROOT), ownerOf(before, "demo/a", ROOT)]).toEqual([type, { ok: true, value: null }, { ok: true, value: null }]);
    }
  });

  it("TR-05: the owner of an entity is the owner of its namespace — of a type, a contract, any entity of it", () => {
    const before = beforeOf({ "demo/namespace": FULL, "team/namespace": { owner: "bob" } });
    expect(["demo/a", "demo/note", "team/contract", "other/a", "01JB2X00000000000000000SES"].map((id) => ownerOf(before, id, ROOT))).toEqual([
      { ok: true, value: "alice" },
      { ok: true, value: "alice" },
      { ok: true, value: "bob" },
      { ok: true, value: null },
      { ok: true, value: null },
    ]);
  });

  it("GL-07: the owner of a namespace is the participant its policy names; that the owner is human is checked with owner acts (S0-17)", () => {
    expect(ownerOf(beforeOf({ "demo/namespace": FULL }), "demo/a", ROOT)).toEqual({ ok: true, value: "alice" });
  });

  it("TR-09, TR-10: the owner of a namespace whose writers are refused is not read; the rejections are where its body sits", () => {
    const body = { owner: "alice", writers: [{ participant: "alice", kind: "human", identities: ["alice"] }] };
    const owner = ownerOf(beforeOf({ "demo/namespace": body }), "demo/a", { intent: null, path: "/demo~1namespace/body" });
    expect(owner.ok ? null : owner.rejections.map((r) => [r.rule, r.path])).toEqual([["TR-09", "/demo~1namespace/body/writers/0/identities/0"]]);
  });
});
