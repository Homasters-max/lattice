// Sessions and the chain of their certificates (TR-10, TR-11, TR-12): a
// session event carries a certificate signed by a key of its participant; the
// chain runs from a key the policy in `before` lists (TR-06), through the
// certificate, to the signature of the proposal by the session key (LG-10).
import { describe, expect, it } from "vitest";
import { reject, ROOT, type JsonValue } from "../../src/kernel/index.js";
import { createView, NO_FACTS, openLines, readProposal, encodeCommit, signProposal, verifyProposal, type Proposal } from "../../src/ledger/index.js";
import {
  certificateHash,
  issueSession,
  policyOf,
  readSession,
  signSession,
  TR_10,
  TR_11,
  TR_12,
  verifySession,
  verifyHash,
  type Policy,
  type Session,
  type UnsignedSession,
} from "../../src/trust/index.js";
import { landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const [ALICE, BOB, MALLORY, SESSION_KEY] = [testKey("alice"), testKey("bob"), testKey("mallory"), testKey("session")];
const AT = "2026-10-06T12:00:00.000000Z";
const AT_SESSION = { intent: null, path: "/session" };

const POLICY: Policy = deepFreeze({
  owner: "alice",
  writers: [
    { participant: "alice", kind: "human", keys: [ALICE.publicKey], roles: ["author"] },
    { participant: "bob", kind: "machine", keys: [BOB.publicKey], roles: ["land"] },
  ],
});

const UNSIGNED: UnsignedSession = deepFreeze({
  id: "01JB2X00000000000000000SES",
  at: "2026-10-06T11:00:00.000000Z",
  body: {
    participant: "alice",
    kind: "human",
    role: "author",
    purpose: "work",
    for: { reason: "requirement", requirement: "demo/requirement@1" },
    software: "lattice",
    version: "0",
    certificate: { key: SESSION_KEY.publicKey, expires: "2026-10-07T11:00:00.000000Z" },
  },
});

function signed(s: UnsignedSession, by = ALICE.key): Session {
  const out = signSession(s, by, ROOT);
  if (!out.ok) throw new Error("bug: a session of this test is canonical");
  return out.value;
}

/** A session body without its reason `for`. */
function withoutReason<B extends { readonly for?: unknown }>(body: B): Omit<B, "for"> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => k !== "for")) as Omit<B, "for">;
}

/** `UNSIGNED` with its body changed, then signed. */
const sessionWith = (body: Partial<UnsignedSession["body"]>, by = ALICE.key) => signed({ ...UNSIGNED, body: { ...UNSIGNED.body, ...body } }, by);

const where = (r: { readonly ok: boolean; readonly rejections?: readonly { readonly rule: string; readonly path: string }[] }) =>
  r.ok ? [] : (r.rejections ?? []).map((x) => [x.rule, x.path]);

/** The chain to nothing past the certificate: the session key it yields. */
const keyOnly = (key: string) => ({ ok: true as const, value: key });

describe("session events (TR-11)", () => {
  it("TR-11: reads a session with its certificate; for and parent are optional", () => {
    const session = signed(UNSIGNED);
    expect(readSession(deepFreeze(session), ROOT)).toEqual({ ok: true, value: session });
    expect(readSession({ ...session, body: { ...withoutReason(session.body), parent: "01JB2X00000000000000000STP" } }, ROOT).ok).toBe(true);
  });

  it("TR-11: refuses a session out of its form, inside the place the caller names", () => {
    const session = signed(UNSIGNED);
    const cases: readonly (readonly [JsonValue, readonly string[][]])[] = [
      [null, [["TR-11", "/session"]]],
      [{ id: session.id, at: session.at }, [["TR-11", "/session/body"]]],
      [{ ...session, by: session.id }, [["TR-11", "/session/by"]]],
      [{ ...session, body: { ...session.body, kind: "robot", purpose: "play" } }, [["TR-11", "/session/body/kind"], ["TR-11", "/session/body/purpose"]]],
      [{ ...session, body: { ...session.body, for: { reason: "requirement" } } }, [["TR-11", "/session/body/for"]]],
      [{ ...session, body: { ...session.body, certificate: "a key" } }, [["TR-11", "/session/body/certificate"]]],
      [{ ...session, body: { ...session.body, certificate: { key: SESSION_KEY.publicKey, expires: "2026-10-07" } } }, [["TR-11", "/session/body/certificate/sig"]]],
      [{ ...session, body: { ...session.body, certificate: { ...session.body.certificate, expires: "2026-10-07" } } }, [["KR-11", "/session/body/certificate/expires"]]],
    ];
    for (const [value, expected] of cases) expect(where(readSession(value, AT_SESSION)), JSON.stringify(value)).toEqual(expected);
  });

  it("TR-11, OB-01: a session with purpose init names no reason", () => {
    expect(where(readSession(sessionWith({ purpose: "init" }), ROOT))).toEqual([["TR-11", "/body/for"]]);
    expect(readSession(signed({ ...UNSIGNED, body: { ...withoutReason(UNSIGNED.body), purpose: "init" } }), ROOT).ok).toBe(true);
  });
});

describe("certificates (TR-11, G-46)", () => {
  it("TR-11, G-46: the certificate signs the hash of the session without its signature, by the participant's key", () => {
    const session = signed(UNSIGNED);
    const hash = certificateHash(UNSIGNED, ROOT);
    expect(certificateHash(session, ROOT)).toEqual(hash);
    expect(hash.ok && verifyHash(hash.value, session.body.certificate.sig, ALICE.publicKey)).toBe(true);
    // Every field of the session is covered: a changed role is another hash.
    expect(certificateHash({ ...UNSIGNED, body: { ...UNSIGNED.body, role: "owner" } }, ROOT)).not.toEqual(hash);
  });

  it("TR-11: issues a session of a human or a machine by its own key; an agent's session comes from its caller (S3)", () => {
    expect(issueSession(UNSIGNED, ALICE.key, ROOT)).toEqual({ ok: true, value: signed(UNSIGNED) });
    expect(where(issueSession({ ...UNSIGNED, body: { ...UNSIGNED.body, kind: "agent" } }, ALICE.key, ROOT))).toEqual([["TR-11", "/body/kind"]]);
    expect(where(issueSession({ ...UNSIGNED, body: { ...UNSIGNED.body, purpose: "init" } }, ALICE.key, ROOT))).toEqual([["TR-11", "/body/for"]]);
  });

  it("TR-11: issues from the value of an unsigned session — a signature it holds is replaced; a value out of form is refused", () => {
    const stale = { ...UNSIGNED, body: { ...UNSIGNED.body, certificate: { ...UNSIGNED.body.certificate, sig: "ed25519:stale" } } };
    expect(issueSession(deepFreeze(stale), ALICE.key, ROOT)).toEqual({ ok: true, value: signed(UNSIGNED) });
    expect(where(issueSession({ ...UNSIGNED, body: { ...UNSIGNED.body, certificate: "a key" } }, ALICE.key, ROOT))).toEqual([["TR-11", "/body/certificate"]]);
    expect(where(issueSession({ ...UNSIGNED, body: "a body" }, ALICE.key, ROOT))).toEqual([["TR-11", "/body"]]);
    expect(where(issueSession("a session", ALICE.key, ROOT))).toEqual([["TR-11", ""]]);
  });
});

/** The chain of a session to its key alone, at `at`, under `policy`. */
const chainOf = (session: JsonValue, policy: Policy = POLICY, at = AT) => verifySession(deepFreeze({ session, policy, at }), AT_SESSION, keyOnly);

describe("the chain of a session (TR-12)", () => {
  it("TR-12: a certificate signed by the key the policy lists for the participant gives the session key", () => {
    expect(chainOf(signed(UNSIGNED))).toEqual({ ok: true, value: SESSION_KEY.publicKey });
    expect(chainOf(sessionWith({ participant: "bob", kind: "machine", role: "land" }, BOB.key)).ok).toBe(true);
  });

  it("TR-12: a certificate signed by a key not in the policy is foreign", () => {
    expect(where(chainOf(signed(UNSIGNED, MALLORY.key)))).toEqual([["TR-12", "/session/body/certificate/sig"]]);
    expect(where(chainOf(signed(UNSIGNED), { owner: "alice" }))).toEqual([["TR-12", "/session/body/certificate/sig"]]);
  });

  it("TR-12: a certificate signed by the key of another participant is foreign", () => {
    expect(where(chainOf(signed(UNSIGNED, BOB.key)))).toEqual([["TR-12", "/session/body/certificate/sig"]]);
  });

  it("TR-12: a certificate changed after it was signed is foreign", () => {
    const session = signed(UNSIGNED);
    const later = { ...session, body: { ...session.body, certificate: { ...session.body.certificate, expires: "2027-10-07T11:00:00.000000Z" } } };
    expect(where(chainOf(later))).toEqual([["TR-12", "/session/body/certificate/sig"]]);
  });

  it("TR-10: the key binds its participant to the kind and the roles of its writer entry", () => {
    expect(where(chainOf(sessionWith({ kind: "machine" })))).toEqual([["TR-10", "/session/body/kind"]]);
    expect(where(chainOf(sessionWith({ role: "land" })))).toEqual([["TR-10", "/session/body/role"]]);
    expect(where(chainOf(signed(UNSIGNED), { owner: "alice", writers: [{ participant: "alice", kind: "human", keys: [ALICE.publicKey] }] }))).toEqual([
      ["TR-10", "/session/body/role"],
    ]);
  });

  it("TR-10: the session key is Ed25519 in OpenSSH format", () => {
    const session = sessionWith({ certificate: { key: "ssh-rsa AAAA", expires: UNSIGNED.body.certificate.expires } });
    expect(where(chainOf(session))).toEqual([["TR-10", "/session/body/certificate/key"]]);
  });

  it("TR-11: the expiry is checked against the time given — an act's source time or the at of the commit", () => {
    const session = signed(UNSIGNED);
    expect(chainOf(session, POLICY, "2026-10-07T10:59:59.999999Z").ok).toBe(true);
    for (const at of ["2026-10-07T11:00:00.000000Z", "2026-10-08T00:00:00.000000Z"]) {
      expect(where(chainOf(session, POLICY, at)), at).toEqual([["TR-11", "/session/body/certificate/expires"]]);
    }
  });

  it("TR-11, TR-12: an expired and foreign certificate is refused for both", () => {
    expect(where(chainOf(signed(UNSIGNED, MALLORY.key), POLICY, "2027-01-01T00:00:00.000000Z"))).toEqual([
      ["TR-11", "/session/body/certificate/expires"],
      ["TR-12", "/session/body/certificate/sig"],
    ]);
  });

  it("TR-11: a session out of its form is refused before its chain", () => {
    expect(where(chainOf({ id: UNSIGNED.id }))).toEqual([["TR-11", "/session/body"], ["TR-11", "/session/at"]].sort());
  });
});

/** A proposal of the session `session`, with one intent, signed by `by` when given. */
function proposalOf(session: Session, by?: typeof SESSION_KEY): Proposal {
  const read = readProposal({
    session,
    intents: [{ op: "entity", id: "demo/a", type: "demo/note@1", expected: null, at: "2026-10-06T11:30:00.000000Z", body: { text: "a" } }],
    sig: null,
  });
  if (!read.ok) throw new Error("bug: the proposal of this test has its form");
  return by === undefined ? read.value : signProposal(read.value, by.key, NO_FACTS);
}

/** The whole chain of TR-12: key in the policy → certificate → proposal, its last link LG-10. */
const toProposal = (p: Proposal, policy: Policy = POLICY) =>
  verifySession({ session: p.session, policy, at: AT }, AT_SESSION, (key) => verifyProposal(p, key, NO_FACTS, ROOT));

describe("the chain to the proposal (TR-12, LG-10)", () => {
  it("TR-12, LG-10: a proposal signed by the session key passes the whole chain", () => {
    const p = proposalOf(signed(UNSIGNED), SESSION_KEY);
    expect(toProposal(p)).toEqual({ ok: true, value: p });
  });

  it("LG-10: a proposal signed by another key than the session's is refused at /sig", () => {
    for (const by of [ALICE, MALLORY, undefined]) {
      expect(where(toProposal(proposalOf(signed(UNSIGNED), by)))).toEqual([["LG-10", "/sig"]]);
    }
  });

  it("TR-12: the proposal is not checked while the chain to its session key is broken", () => {
    let checked = false;
    const out = verifySession({ session: signed(UNSIGNED, MALLORY.key), policy: POLICY, at: AT }, AT_SESSION, (key) => {
      checked = true;
      return keyOnly(key);
    });
    expect([out.ok, checked]).toEqual([false, false]);
  });
});

/** A proposal that writes the namespace `demo` with `policy` as revision `expected + 1`. */
const namespaceProposal = (policy: JsonValue, expected: number | null) => ({
  session: { id: UNSIGNED.id },
  intents: [{ op: "entity", id: "demo/namespace", type: "std/namespace-policy@1", expected, at: "2026-10-06T11:00:00.000000Z", body: policy }],
  sig: null,
});

describe("policy from before (TR-06)", () => {
  it("TR-06: a change of policy applies from the commit after the one that lands it", () => {
    const v1 = { owner: "alice", writers: [{ participant: "alice", kind: "human", keys: [MALLORY.publicKey], roles: ["author"] }] };
    const v2 = { owner: "alice", writers: [{ participant: "alice", kind: "human", keys: [ALICE.publicKey], roles: ["author"] }] };
    const lines = landedChain([namespaceProposal(v1, null), namespaceProposal(v2, 1)]).map((c) => new TextEncoder().encode(encodeCommit(c)));
    const viewAt = (n: number) => {
      const opened = openLines(lines.slice(0, n));
      if (!opened.ok) throw new Error("bug: the chain of this test opens");
      return opened.value.view;
    };
    const policyAt = (n: number) => {
      const p = policyOf(viewAt(n), "demo", ROOT);
      if (!p.ok || p.value === null) throw new Error("bug: the namespace demo is in the view");
      return p.value;
    };
    // The commit that lands v2 is judged in before = the view at 1: v2 does not grant its own commit the key of alice.
    expect(where(chainOf(signed(UNSIGNED), policyAt(1)))).toEqual([["TR-12", "/session/body/certificate/sig"]]);
    expect(chainOf(signed(UNSIGNED), policyAt(2)).ok).toBe(true);
    // A later change never changes what an earlier commit needed: the view at 1 still holds v1.
    expect(policyAt(1)).toEqual(v1);
    expect(policyOf(createView(0, []), "demo", ROOT)).toEqual({ ok: true, value: null });
  });
});

/** The place of a session in a proposal of the intent `x`: rejections inside it keep the intent. */
const IN_INTENT = { intent: "x", path: "/session" };
const at = (path: string) => ({ intent: "x", path: `/session${path}` });

describe("what a rejection of a session names (TR-10, TR-11, TR-12)", () => {
  it("TR-11: the form of a session — what was expected, what came, inside the place the caller names", () => {
    const session = signed(UNSIGNED);
    const cases: readonly (readonly [JsonValue, ReturnType<typeof reject>])[] = [
      ["a session", reject(TR_11, { ...IN_INTENT, expected: "a session event", got: "a session" })],
      [{ ...session, body: "a body" }, reject(TR_11, { ...at("/body"), expected: "the body of a session", got: "a body" })],
      [{ ...session, body: { ...session.body, certificate: "a key" } }, reject(TR_11, { ...at("/body/certificate"), expected: "a certificate {key, expires, sig}", got: "a key" })],
      [
        { ...session, body: { ...session.body, purpose: "init" } },
        reject(TR_11, { ...at("/body/for"), expected: "absent: a session with purpose init has no reason", got: session.body.for ?? null }),
      ],
    ];
    for (const [value, rejection] of cases) expect(readSession(value, IN_INTENT), JSON.stringify(value)).toEqual({ ok: false, rejections: [rejection] });
  });

  it("TR-11: an empty participant or step and a reason out of its form are refused; a finding is a reason", () => {
    const body = (over: JsonValue) => ({ ...signed(UNSIGNED), body: { ...signed(UNSIGNED).body, ...(over as object) } });
    const finding = { reason: "finding", rule: "TR-34", subject: "demo/a@1" };
    expect(readSession(body({ for: finding }), ROOT).ok).toBe(true);
    const cases: readonly (readonly [JsonValue, string])[] = [
      [{ participant: "" }, "/body/participant"],
      [{ parent: "" }, "/body/parent"],
      [{ for: { reason: "requirement", requirement: "" } }, "/body/for"],
      [{ for: { reason: "requirement", requirement: "demo/r@1", rule: "TR-34" } }, "/body/for"],
      [{ for: { reason: "finding", rule: "TR-34" } }, "/body/for"],
      [{ for: { ...finding, rule: "" } }, "/body/for"],
      [{ for: { ...finding, reason: "wish" } }, "/body/for"],
      [{ for: { reason: "wish", requirement: "demo/r@1" } }, "/body/for"],
    ];
    for (const [over, path] of cases) expect(where(readSession(body(over), ROOT)), path).toEqual([["TR-11", path]]);
  });

});

describe("what a rejection of the chain names (TR-10, TR-11, TR-12)", () => {
  it("TR-11: an agent's session is refused at its kind when issued by its own key", () => {
    expect(issueSession({ ...UNSIGNED, body: { ...UNSIGNED.body, kind: "agent" } }, ALICE.key, IN_INTENT)).toEqual({
      ok: false,
      rejections: [reject(TR_11, { ...at("/body/kind"), expected: "human or machine: an agent session is certified by its caller", got: "agent" })],
    });
  });

  it("TR-10, TR-11, TR-12: the chain names the expiry, the writer's kind and roles, the hash and the key it expected", () => {
    const chain = (session: Session, policy: Policy = POLICY, time = AT) => verifySession({ session, policy, at: time }, IN_INTENT, keyOnly);
    const expired = signed(UNSIGNED);
    expect(chain(expired, POLICY, "2026-10-08T00:00:00.000000Z")).toEqual({
      ok: false,
      rejections: [reject(TR_11, { ...at("/body/certificate/expires"), expected: "later than 2026-10-08T00:00:00.000000Z", got: "2026-10-07T11:00:00.000000Z" })],
    });
    expect(chain(sessionWith({ kind: "machine", role: "land" }))).toEqual({
      ok: false,
      rejections: [reject(TR_10, { ...at("/body/kind"), expected: "human", got: "machine" }), reject(TR_10, { ...at("/body/role"), expected: ["author"], got: "land" })],
    });
    const foreign = signed(UNSIGNED, MALLORY.key);
    const hash = certificateHash(foreign, ROOT);
    expect(chain(foreign)).toEqual({
      ok: false,
      rejections: [reject(TR_12, { ...at("/body/certificate/sig"), expected: { hash: hash.ok ? hash.value : "", by: "a key of alice in the policy" }, got: foreign.body.certificate.sig })],
    });
    const rsa = sessionWith({ certificate: { key: "ssh-rsa AAAA", expires: UNSIGNED.body.certificate.expires } });
    expect(chain(rsa)).toEqual({ ok: false, rejections: [reject(TR_10, { ...at("/body/certificate/key"), expected: "ssh-ed25519 <base64> [comment]", got: "ssh-rsa AAAA" })] });
  });
});
