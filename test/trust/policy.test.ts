// A namespace and its policy (TR-01, TR-02, TR-05): the policy is the body of
// `<name>/namespace`, read field by field; its writer entries name identities
// (TR-09) and Ed25519 keys bound to a kind (TR-10); the owner of an entity is
// the owner of its namespace (GL-07), read in `before` (TR-06).
import { describe, expect, it } from "vitest";
import { ROOT, type JsonValue, type Record } from "../../src/kernel/index.js";
import { namespaceId, namespaceOf, ownerOf, policyOf, readPolicy, type Before } from "../../src/trust/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const ALICE = testKey("alice");
const FINGERPRINT = `ssh:SHA256:${"A".repeat(43)}`;

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
  budget: { ms: 1000, tokens: 0, usd: "1.50", calls: 3 },
  quality: "demo/quality@1",
} as const;

const read = (value: JsonValue) => readPolicy(deepFreeze(value), ROOT);
const refusals = (value: JsonValue) => {
  const r = read(value);
  return r.ok ? [] : r.rejections.map((x) => [x.rule, x.path]);
};

describe("namespace policy (TR-02)", () => {
  it("TR-02: reads every field of a policy as it is", () => {
    expect(read(FULL)).toEqual({ ok: true, value: FULL });
    expect(read({ owner: "alice" })).toEqual({ ok: true, value: { owner: "alice" } });
  });

  it("TR-02: refuses a policy without an owner, with a field it does not name, or a field out of its form", () => {
    expect(refusals("alice")).toEqual([["TR-02", ""]]);
    expect(refusals({ writers: [] })).toEqual([["TR-02", "/owner"]]);
    expect(refusals({ owner: "alice", admins: ["bob"] })).toEqual([["TR-02", "/admins"]]);
    expect(refusals({ owner: "alice", recovery: { participants: ["bob"], count: 0 } })).toEqual([["TR-02", "/recovery"]]);
    expect(refusals({ owner: "alice", roles: { author: { types: ["x"], rights: [] } } })).toEqual([["TR-02", "/roles"]]);
    expect(refusals({ owner: "alice", acts: [{ match: ["x"] }] })).toEqual([["TR-02", "/acts"]]);
    expect(refusals({ owner: "alice", pins: { libraries: [] } })).toEqual([["TR-02", "/pins"]]);
    expect(refusals({ owner: "alice", budget: { usd: 1 } })).toEqual([["TR-02", "/budget"]]);
    expect(refusals({ owner: "alice", labels: { blocks: "" } })).toEqual([["TR-02", "/labels"]]);
    expect(refusals({ owner: "alice", writers: {} })).toEqual([["TR-02", "/writers"]]);
  });

  it("TR-02, TR-07: refuses a writer entry out of its form, with every other entry read", () => {
    const writers = [{ participant: "bob", kind: "robot" }, "carol", { participant: "dan", kind: "human", keys: ["ssh-rsa AAAA"] }];
    expect(refusals({ owner: 1, writers })).toEqual([
      ["TR-02", "/owner"],
      ["TR-02", "/writers/0/kind"],
      ["TR-02", "/writers/1"],
      ["TR-10", "/writers/2/keys/0"],
    ]);
  });
});

describe("writer entries (TR-09, TR-10)", () => {
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

  it("TR-02: rejections are placed under the place the caller names", () => {
    const r = readPolicy({ writers: [] }, { intent: "demo/namespace", path: "/body" });
    expect(r.ok ? null : r.rejections[0]).toMatchObject({ intent: "demo/namespace", path: "/body/owner", rule: "TR-02" });
  });
});

/** A `before` that holds these namespace records by id. */
function beforeOf(records: { readonly [id: string]: JsonValue }): Before {
  const held = (id: string): Record | null =>
    Object.hasOwn(records, id) ? { id, rev: 1, type: "std/namespace-policy@1", hash: `sha256:${"0".repeat(64)}`, by: "01JB2X00000000000000000SES", at: "2026-10-06T11:00:00.000000Z", body: records[id]! } : null;
  return deepFreeze({ current: held });
}

describe("namespaces and owners (TR-01, TR-05)", () => {
  it("TR-01, KR-06: the namespace of an entity is the prefix of its id; an event id has none", () => {
    expect([namespaceOf("demo/a"), namespaceOf("std/namespace"), namespaceOf("01JB2X00000000000000000SES")]).toEqual(["demo", "std", null]);
    expect(namespaceId("demo")).toBe("demo/namespace");
  });

  it("TR-01, TR-06: the policy of a namespace is the body of its namespace entity in before; none where before holds none", () => {
    const before = beforeOf({ "demo/namespace": FULL });
    expect(policyOf(before, "demo", ROOT)).toEqual({ ok: true, value: FULL });
    expect(policyOf(before, "other", ROOT)).toEqual({ ok: true, value: null });
  });

  it("TR-05, GL-07: the owner of an entity is the owner of its namespace — of a type, a contract, any entity of it", () => {
    const before = beforeOf({ "demo/namespace": FULL, "team/namespace": { owner: "bob" } });
    expect(["demo/a", "demo/note", "team/contract", "other/a", "01JB2X00000000000000000SES"].map((id) => ownerOf(before, id, ROOT))).toEqual([
      { ok: true, value: "alice" },
      { ok: true, value: "alice" },
      { ok: true, value: "bob" },
      { ok: true, value: null },
      { ok: true, value: null },
    ]);
  });

  it("TR-02: the owner of a namespace whose policy is out of its form is not read", () => {
    const owner = ownerOf(beforeOf({ "demo/namespace": { owners: ["alice"] } }), "demo/a", { intent: null, path: "/demo~1namespace/body" });
    expect(owner.ok ? null : owner.rejections.map((r) => [r.rule, r.path])).toEqual([
      ["TR-02", "/demo~1namespace/body/owner"],
      ["TR-02", "/demo~1namespace/body/owners"],
    ]);
  });
});
