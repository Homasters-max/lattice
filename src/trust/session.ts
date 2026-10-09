// A session (TR-11) and the chain that admits its proposals (TR-12). `by` of
// every record is a session event of `core/session`: participant, kind, role,
// purpose, `for`, `parent`, software and version, and a certificate — the
// session's public key, an expiry and a signature by a key of the participant.
// In a proposal the session event is `{id, at, body}` (LG-09, G-47); its body
// has one form, the schema of `core/session@1`, which the kernel checks
// against the type the caller resolves (KR-21) — trust refuses only what that
// schema does not say: the reason a purpose needs (OB-01), the Ed25519 session
// key (TR-10), the expiry and the chain. The certificate signs the hash of the
// session event without `sig` (G-48), as a commit and a proposal are signed
// (LG-06, LG-10, G-24). Apply verifies the chain from a key the policy lists
// for the participant, through the certificate, to the signature of the
// proposal by the session key; an expired or foreign certificate is rejected.
// In S0 a `human` or `machine` session is certified by the participant's own
// key; the sessions agents get from a caller arrive with S3.
import {
  checkAgainstType,
  checkFormat,
  checkId,
  closedForm,
  compareText,
  hash,
  isJsonObject,
  refuse,
  refused,
  reject,
  rejectionsOf,
  STRING,
  type JsonObject,
  type JsonValue,
  type MembersOf,
  type Place,
  type Rejection,
  type ResolveType,
  type Result,
} from "../kernel/index.js";
import type { ParticipantKind, Policy, Writer } from "./policy.js";
import { TR_10, TR_11, TR_12 } from "./rules.js";
import { isPublicKey, signHash, verifyHash, type ParticipantKey, type PublicKey } from "./signature.js";

/** TR-11: what a session is for. */
export type Purpose = "init" | "work" | "import" | "check" | "bench" | "explore";

/** OB-01: the reason of the work — a requirement, or a finding `{rule, subject}` (TR-34). */
export type Reason =
  | { readonly reason: "requirement"; readonly requirement: string }
  | { readonly reason: "finding"; readonly rule: string; readonly subject: string };

/** TR-11: the certificate of a session — its public key, an expiry, and the signature of the participant's key. */
export type Certificate = { readonly key: PublicKey; readonly expires: string; readonly sig: string };

/** TR-11: the body of a session event, as its type `core/session@1` admits it. */
export type SessionBody = {
  readonly participant: string;
  readonly kind: ParticipantKind;
  readonly role: string;
  readonly purpose: Purpose;
  readonly for?: Reason;
  readonly parent?: string;
  readonly software: string;
  readonly version: string;
  readonly certificate: Certificate;
};

/** TR-11, LG-09: a session event as a proposal carries it — every value of the event that is not computed (G-47). */
export type Session = { readonly id: string; readonly at: string; readonly body: SessionBody };

/** A session before the participant signs its certificate: all that the signature covers (G-48). */
export type UnsignedSession = {
  readonly id: string;
  readonly at: string;
  readonly body: Omit<SessionBody, "certificate"> & { readonly certificate: Omit<Certificate, "sig"> };
};

/** TR-11: the type of every session event; ledger code writes it in genesis (LG-47). */
const SESSION_TYPE = "core/session@1";

/** What the closed form of a session admits: its body as a JSON object, which its type reads. */
type SessionFields = Omit<Session, "body"> & { readonly body: JsonObject };

/** TR-11, LG-09, G-47: the members of a session event in a proposal; no other field. */
const SESSION: MembersOf<SessionFields> = {
  id: STRING,
  at: STRING,
  body: { expected: "the body of a session", fits: isJsonObject },
};

/** The place of a member under the place of what holds it. */
const under = (place: Place, ...names: readonly string[]): Place => ({ intent: place.intent, path: [place.path, ...names].join("/") });

/** OB-01: the purposes whose session names its reason in `for`; `init` has none, `explore` names it later by a link (TR-13). */
const REASONED: readonly Purpose[] = ["work", "import", "check", "bench"];

/** TR-11, OB-01: a session with purpose `init` names no reason; one with purpose work, import, check or bench names it. */
function reasonRejections(b: SessionBody, place: Place): Rejection[] {
  const at = under(place, "for");
  if (b.purpose === "init" && b.for !== undefined) return [reject(TR_11, { ...at, expected: "absent: a session with purpose init has no reason", got: b.for })];
  if (REASONED.includes(b.purpose) && b.for === undefined) return [reject(TR_11, { ...at, expected: `a reason: a session with purpose ${b.purpose} names it (OB-01)`, got: "absent" })];
  return [];
}

/**
 * TR-11: the session event a JSON value holds, or its rejections at the place the caller names — where the session
 * sits in its input, `/session` of a proposal: its form `{id, at, body}` (G-47), its `id` a ULID (KR-06), its `at` a
 * time (KR-11), its body against the type `core/session@1` that `types` resolves (KR-21), and the reason its purpose
 * needs (OB-01).
 */
export function readSession(value: JsonValue, types: ResolveType, place: Place): Result<Session> {
  if (!isJsonObject(value)) return refuse(reject(TR_11, { ...place, expected: "a session event", got: value }));
  const form = closedForm(value, SESSION, TR_11, place);
  if (!form.ok) return form;
  const { id, at, body } = form.value;
  const admitted = checkAgainstType({ type: SESSION_TYPE, body }, types, place);
  const formats = [...rejectionsOf(checkId("event", id, under(place, "id"))), ...rejectionsOf(checkFormat("date-time", at, under(place, "at")))];
  const refusal = refused<Session>([...formats, ...rejectionsOf(admitted)]);
  if (refusal !== null) return refusal;
  // The type admitted the body: its schema is the form of SessionBody, and its objects are closed (KR-18).
  const session: Session = { id, at, body: body as SessionBody };
  return refused<Session>(reasonRejections(session.body, under(place, "body"))) ?? { ok: true, value: session };
}

/** A session value without the signature of its certificate, or with it set to `sig`, where it has a certificate to hold one. */
function withSignature(value: JsonValue, sig: string | null): JsonValue {
  if (!isJsonObject(value) || !isJsonObject(value.body) || !isJsonObject(value.body.certificate)) return value;
  const unsigned = Object.fromEntries(Object.entries(value.body.certificate).filter(([name]) => name !== "sig"));
  return { ...value, body: { ...value.body, certificate: sig === null ? unsigned : { ...unsigned, sig } } };
}

/**
 * TR-11, G-48: the hash of a session without the signature of its certificate — every other member is covered — or
 * the rejections of a session that is not canonical (KR-10).
 */
export const certificateHash = (s: UnsignedSession | Session, place: Place): Result<string> => hash(withSignature(s, null), place);

/** TR-11: the session with its certificate signed by the key of its participant. */
export function signSession(s: UnsignedSession | Session, participantKey: ParticipantKey, place: Place): Result<Session> {
  const signed = certificateHash(s, place);
  if (!signed.ok) return signed;
  return { ok: true, value: { ...s, body: { ...s.body, certificate: { ...s.body.certificate, sig: signHash(signed.value, participantKey) } } } };
}

/**
 * TR-11: a session issued for a `human` or `machine` participant from the JSON value of an unsigned session — its
 * certificate signed by the participant's own key, then read as apply reads a session, against the types `types`
 * resolves, at the place the caller names; a session of an agent gets its certificate from a caller (S3).
 */
export function issueSession(value: JsonValue, participantKey: ParticipantKey, types: ResolveType, place: Place): Result<Session> {
  const covered = withSignature(value, null);
  const signed = hash(covered, place);
  if (!signed.ok) return signed;
  const read = readSession(withSignature(covered, signHash(signed.value, participantKey)), types, place);
  if (!read.ok) return read;
  const { kind } = read.value.body;
  if (kind === "agent") return refuse(reject(TR_11, { ...under(place, "body", "kind"), expected: "human or machine: an agent session is certified by its caller", got: kind }));
  return read;
}

/** TR-11: the certificate has not expired at the time it is checked against. */
function expiryRejections(s: Session, at: string, place: Place): Rejection[] {
  const { expires } = s.body.certificate;
  return compareText(at, expires) < 0 ? [] : [reject(TR_11, { ...under(place, "body", "certificate", "expires"), expected: `later than ${at}`, got: expires })];
}

/** TR-10: the writer entry whose key signed a certificate binds that key to the session's kind and role. */
function bindingRejections(s: Session, writer: Writer, place: Place): Rejection[] {
  const { kind, role } = s.body;
  const roles = writer.roles ?? [];
  return [
    ...(writer.kind === kind ? [] : [reject(TR_10, { ...under(place, "body", "kind"), expected: writer.kind, got: kind })]),
    ...(roles.includes(role) ? [] : [reject(TR_10, { ...under(place, "body", "role"), expected: [...roles], got: role })]),
  ];
}

/** TR-12: the certificate is signed by a key the policy lists for the session's participant; TR-10 binds that key. */
function chainRejections(s: Session, policy: Policy, signed: string, place: Place): Rejection[] {
  const { participant, certificate } = s.body;
  const writer = (policy.writers ?? []).find((w) => w.participant === participant && (w.keys ?? []).some((k) => verifyHash(signed, certificate.sig, k)));
  if (writer !== undefined) return bindingRejections(s, writer, place);
  return [reject(TR_12, { ...under(place, "body", "certificate", "sig"), expected: { hash: signed, by: `a key of ${participant} in the policy` }, got: certificate.sig })];
}

/** TR-10: the session key is Ed25519 in OpenSSH format. */
const sessionKeyRejections = (s: Session, place: Place): Rejection[] =>
  isPublicKey(s.body.certificate.key) ? [] : [reject(TR_10, { ...under(place, "body", "certificate", "key"), expected: "ssh-ed25519 <base64> [comment]", got: s.body.certificate.key })];

/**
 * The chain of a session: the session event as it sits in its input, the types its body is read against — the
 * session type `core/session@1` among them (KR-21) — the policy in `before` (TR-06) that lists the keys of its
 * participant, and the time its expiry is checked against — the source time of the first act counted for the
 * proposal (TR-16), or the `at` of the commit when no act is counted (TR-11).
 */
export type Chain = { readonly session: JsonValue; readonly types: ResolveType; readonly policy: Policy; readonly at: string };

/**
 * TR-12: verifies the chain from a key in the policy, through the certificate, to the proposal. The session is read
 * (TR-11) at the place the caller names; its certificate must be unexpired at `at` (TR-11) and signed by a key the
 * policy binds to the session's participant, kind and role (TR-12, TR-10). Only then is the last link checked:
 * `proposal` verifies the signature of the proposal by the session key — LG-10, which the ledger gives, so the hash
 * of a proposal stays the ledger's.
 */
export function verifySession<T>(chain: Chain, place: Place, proposal: (sessionKey: PublicKey) => Result<T>): Result<T> {
  const read = readSession(chain.session, chain.types, place);
  if (!read.ok) return read;
  const signed = certificateHash(read.value, place);
  if (!signed.ok) return signed;
  const found = [...expiryRejections(read.value, chain.at, place), ...sessionKeyRejections(read.value, place), ...chainRejections(read.value, chain.policy, signed.value, place)];
  return refused<T>(found) ?? proposal(read.value.body.certificate.key);
}
