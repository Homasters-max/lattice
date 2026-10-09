// Sessions and the chain of their certificates (TR-10, TR-11, TR-12): a
// session event carries a certificate signed by a key of its participant; its
// body has the one form of its type `core/session@1` (KR-21), and trust adds
// what that schema does not say — the reason a purpose needs (OB-01). The
// chain runs from a key the policy in `before` lists (TR-06), through the
// certificate, to the signature of the proposal by the session key (LG-10).
import { describe, expect, it } from "vitest";
import { reject, ROOT, type JsonValue, type ResolveType } from "../../src/kernel/index.js";
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
import { std } from "../ledger/std-sources.js";
import { landedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { testKey } from "../support/keys.js";

const [ALICE, BOB, MALLORY, SESSION_KEY] = [testKey("alice"), testKey("bob"), testKey("mallory"), testKey("session")];
const AT = "2026-10-06T12:00:00.000000Z";
const AT_SESSION = { intent: null, path: "/session" };

/** The types a session is read against: `core/session@1`, as genesis holds it, and the types of std. */
const TYPES: ResolveType = (ref) => std().resolve(ref);

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
  const out = signSession(deepFreeze(s), by, ROOT);
  if (!out.ok) throw new Error("bug: a session of this test is canonical");
  return out.value;
}

/** A session body without its reason `for`. */
function withoutReason<B extends { readonly for?: unknown }>(body: B): Omit<B, "for"> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => k !== "for")) as Omit<B, "for">;
}

/** `UNSIGNED` with its body changed, then signed. */
const sessionWith = (body: Partial<UnsignedSession["body"]>, by = ALICE.key) => signed({ ...UNSIGNED, body: { ...UNSIGNED.body, ...body } }, by);

const where = (r: { readonly ok: boolean; readonly rejections?: readonly { readonly rule: string; readonly path: string }[] }) => (r.ok ? [] : (r.rejections ?? []).map((x) => [x.rule, x.path]));

const read = (value: JsonValue, place = ROOT) => readSession(deepFreeze(value), TYPES, place);
const issue = (value: JsonValue, place = ROOT) => issueSession(deepFreeze(value), ALICE.key, TYPES, place);

/** The chain to nothing past the certificate: the session key it yields. */
const keyOnly = (key: string) => ({ ok: true as const, value: key });

describe("session events (TR-11)", () => {
  it("TR-11: reads a session with its certificate; parent is optional", () => {
    const session = signed(UNSIGNED);
    expect(read(deepFreeze(session))).toEqual({ ok: true, value: session });
    expect(read({ ...session, body: { ...session.body, parent: "01JB2X00000000000000000STP" } }).ok).toBe(true);
  });

  it("TR-11, G-45: refuses a session event out of its form {id, at, body}, inside the place the caller names", () => {
    const session = signed(UNSIGNED);
    const cases: readonly (readonly [JsonValue, readonly string[][]])[] = [
      [null, [["TR-11", "/session"]]],
      [{ id: session.id, at: session.at }, [["TR-11", "/session/body"]]],
      [{ ...session, by: session.id }, [["TR-11", "/session/by"]]],
      [{ ...session, id: 7 }, [["TR-11", "/session/id"]]],
    ];
    for (const [value, expected] of cases) expect(where(readSession(deepFreeze(value), TYPES, AT_SESSION)), JSON.stringify(value)).toEqual(expected);
  });

  it("KR-06, KR-11, G-45: the id of a session is a ULID, its at a time", () => {
    const session = signed(UNSIGNED);
    expect(where(read({ ...session, id: "alice/session" }))).toEqual([["KR-06", "/id"]]);
    expect(where(read({ ...session, at: "2026-10-06" }))).toEqual([["KR-11", "/at"]]);
  });

  it("KR-15: a session is read against the type its caller resolves; without core/session@1 it is no session", () => {
    expect(where(readSession(deepFreeze(signed(UNSIGNED)), () => null, AT_SESSION))).toEqual([["KR-15", "/session/type"]]);
  });
});

describe("the body of a session (KR-21)", () => {
  it("KR-21: the body of a session has the one form of its type core/session@1", () => {
    const session = signed(UNSIGNED);
    const finding = { reason: "finding", rule: "TR-34", subject: "demo/a@1" };
    expect(read({ ...session, body: { ...session.body, for: finding } }).ok).toBe(true);
    const cases: readonly (readonly [JsonValue, string])[] = [
      [{ kind: "robot" }, "/body/kind"],
      [{ purpose: "play" }, "/body/purpose"],
      [{ participant: "" }, "/body/participant"],
      [{ parent: "" }, "/body/parent"],
      [{ certificate: "a key" }, "/body/certificate"],
      [{ certificate: { ...session.body.certificate, expires: "2026-10-07" } }, "/body/certificate/expires"],
      [{ certificate: { ...session.body.certificate, by: "alice" } }, "/body/certificate/by"],
      [{ for: { reason: "requirement" } }, "/body/for"],
      [{ for: { reason: "requirement", requirement: "" } }, "/body/for"],
      [{ for: { ...finding, reason: "wish" } }, "/body/for"],
      [{ owner: "alice" }, "/body/owner"],
    ];
    for (const [over, path] of cases) {
      const found = where(read({ ...session, body: { ...session.body, ...(over as object) } }));
      expect([path, found.length > 0 && found.every(([rule, at]) => rule === "KR-21" && at?.startsWith(path))], JSON.stringify(found)).toEqual([path, true]);
    }
  });
});

describe("the reason of a session (TR-11, OB-01)", () => {
  it("TR-11, OB-01: a session with purpose init names no reason; work, import, check and bench name one; explore names it later", () => {
    expect(where(read(sessionWith({ purpose: "init" })))).toEqual([["TR-11", "/body/for"]]);
    expect(read(signed({ ...UNSIGNED, body: { ...withoutReason(UNSIGNED.body), purpose: "init" } })).ok).toBe(true);
    for (const purpose of ["work", "import", "check", "bench"] as const) {
      expect([purpose, where(read(signed({ ...UNSIGNED, body: { ...withoutReason(UNSIGNED.body), purpose } })))]).toEqual([purpose, [["TR-11", "/body/for"]]]);
      expect([purpose, read(sessionWith({ purpose })).ok]).toEqual([purpose, true]);
    }
    expect(read(signed({ ...UNSIGNED, body: { ...withoutReason(UNSIGNED.body), purpose: "explore" } })).ok).toBe(true);
    expect(read(sessionWith({ purpose: "explore" })).ok).toBe(true);
  });
});

describe("certificates (TR-11, G-46)", () => {
  it("TR-11, G-46: the certificate signs the hash of the session without its signature, by the participant's key", () => {
    const session = signed(UNSIGNED);
    const hash = certificateHash(deepFreeze(UNSIGNED), ROOT);
    expect(certificateHash(deepFreeze(session), ROOT)).toEqual(hash);
    expect(hash.ok && verifyHash(hash.value, session.body.certificate.sig, ALICE.publicKey)).toBe(true);
    // Every field of the session is covered: a changed role or expiry is another hash.
    expect(certificateHash(deepFreeze({ ...UNSIGNED, body: { ...UNSIGNED.body, role: "owner" } }), ROOT)).not.toEqual(hash);
    expect(certificateHash(deepFreeze({ ...UNSIGNED, body: { ...UNSIGNED.body, certificate: { ...UNSIGNED.body.certificate, expires: "2027-10-07T11:00:00.000000Z" } } }), ROOT)).not.toEqual(hash);
  });

  it("TR-11: issues a session of a human or a machine by its own key; an agent's session comes from its caller (S3)", () => {
    expect(issue(UNSIGNED)).toEqual({ ok: true, value: signed(UNSIGNED) });
    expect(where(issue({ ...UNSIGNED, body: { ...UNSIGNED.body, kind: "agent" } }))).toEqual([["TR-11", "/body/kind"]]);
    expect(where(issue({ ...UNSIGNED, body: { ...UNSIGNED.body, purpose: "init" } }))).toEqual([["TR-11", "/body/for"]]);
  });

  it("TR-11: issues from the value of an unsigned session — a signature it holds is replaced; a value out of form is refused", () => {
    const stale = { ...UNSIGNED, body: { ...UNSIGNED.body, certificate: { ...UNSIGNED.body.certificate, sig: "ed25519:stale" } } };
    expect(issue(deepFreeze(stale))).toEqual({ ok: true, value: signed(UNSIGNED) });
    expect(where(issue({ ...UNSIGNED, body: { ...UNSIGNED.body, certificate: "a key" } }))).toEqual([["KR-21", "/body/certificate"]]);
    expect(where(issue({ ...UNSIGNED, body: "a body" }))).toEqual([["TR-11", "/body"]]);
    expect(where(issue("a session"))).toEqual([["TR-11", ""]]);
  });
});

/** The chain of a session to its key alone, at `at`, under `policy`. */
const chainOf = (session: JsonValue, policy: Policy = POLICY, at = AT) => verifySession(deepFreeze({ session, types: TYPES, policy, at }), AT_SESSION, keyOnly);

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

  it("TR-11: a session out of its form or without its reason is refused before its chain", () => {
    expect(where(chainOf({ id: UNSIGNED.id }))).toEqual([["TR-11", "/session/body"], ["TR-11", "/session/at"]].sort());
    expect(where(chainOf(signed({ ...UNSIGNED, body: withoutReason(UNSIGNED.body) }, MALLORY.key)))).toEqual([["TR-11", "/session/body/for"]]);
  });
});

describe("the binding and the expiry of a certificate (TR-10, TR-11)", () => {
  it("TR-07: a machine is a program name without a version: each version is a new session of the one participant of the policy", () => {
    const land = (id: string, version: string) => chainOf(signed({ ...UNSIGNED, id, body: { ...UNSIGNED.body, participant: "bob", kind: "machine", role: "land", version } }, BOB.key));
    expect([land("01JB2X00000000000000000SE0", "0"), land("01JB2X00000000000000000SE1", "1")]).toEqual([keyOnly(SESSION_KEY.publicKey), keyOnly(SESSION_KEY.publicKey)]);
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
});

/** A proposal of the session `session`, with one intent, signed by `by` when given. */
function proposalOf(session: Session, by?: typeof SESSION_KEY): Proposal {
  const read = readProposal(deepFreeze({
    session,
    intents: [{ op: "entity", id: "demo/a", type: "demo/note@1", expected: null, at: "2026-10-06T11:30:00.000000Z", body: { text: "a" } }],
    sig: null,
  }));
  if (!read.ok) throw new Error("bug: the proposal of this test has its form");
  return by === undefined ? read.value : signProposal(deepFreeze(read.value), by.key, NO_FACTS);
}

/** The whole chain of TR-12: key in the policy → certificate → proposal, its last link LG-10. */
const toProposal = (p: Proposal, policy: Policy = POLICY) =>
  verifySession(deepFreeze({ session: p.session, types: TYPES, policy, at: AT }), AT_SESSION, (key) => verifyProposal(deepFreeze(p), key, NO_FACTS, ROOT));

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
    const out = verifySession(deepFreeze({ session: signed(UNSIGNED, MALLORY.key), types: TYPES, policy: POLICY, at: AT }), AT_SESSION, (key) => {
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

describe("what a rejection of a session names (TR-11)", () => {
  it("TR-11: the form of a session and its reason — what was expected, what came, inside the place the caller names", () => {
    const session = signed(UNSIGNED);
    const cases: readonly (readonly [JsonValue, ReturnType<typeof reject>])[] = [
      ["a session", reject(TR_11, { ...IN_INTENT, expected: "a session event", got: "a session" })],
      [{ ...session, body: "a body" }, reject(TR_11, { ...at("/body"), expected: "the body of a session", got: "a body" })],
      [
        { ...session, body: { ...session.body, purpose: "init" } },
        reject(TR_11, { ...at("/body/for"), expected: "absent: a session with purpose init has no reason", got: session.body.for ?? null }),
      ],
      [
        { ...session, body: { ...withoutReason(session.body), purpose: "bench" } },
        reject(TR_11, { ...at("/body/for"), expected: "a reason: a session with purpose bench names it (OB-01)", got: "absent" }),
      ],
    ];
    for (const [value, rejection] of cases) expect(readSession(deepFreeze(value), TYPES, IN_INTENT), JSON.stringify(value)).toEqual({ ok: false, rejections: [rejection] });
  });

  it("TR-11: an agent's session is refused at its kind when issued by its own key", () => {
    expect(issue({ ...UNSIGNED, body: { ...UNSIGNED.body, kind: "agent" } }, IN_INTENT)).toEqual({
      ok: false,
      rejections: [reject(TR_11, { ...at("/body/kind"), expected: "human or machine: an agent session is certified by its caller", got: "agent" })],
    });
  });
});

describe("what a rejection of the chain names (TR-10, TR-11, TR-12)", () => {
  it("TR-10, TR-11, TR-12: the chain names the expiry, the writer's kind and roles, the hash and the key it expected", () => {
    const chain = (session: Session, policy: Policy = POLICY, time = AT) => verifySession(deepFreeze({ session, types: TYPES, policy, at: time }), IN_INTENT, keyOnly);
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
    const hash = certificateHash(deepFreeze(foreign), ROOT);
    expect(chain(foreign)).toEqual({
      ok: false,
      rejections: [reject(TR_12, { ...at("/body/certificate/sig"), expected: { hash: hash.ok ? hash.value : "", by: "a key of alice in the policy" }, got: foreign.body.certificate.sig })],
    });
    const rsa = sessionWith({ certificate: { key: "ssh-rsa AAAA", expires: UNSIGNED.body.certificate.expires } });
    expect(chain(rsa)).toEqual({ ok: false, rejections: [reject(TR_10, { ...at("/body/certificate/key"), expected: "ssh-ed25519 <base64> [comment]", got: "ssh-rsa AAAA" })] });
  });
});
