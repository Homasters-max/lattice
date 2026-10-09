// A session (TR-11) and the chain that admits its proposals (TR-12). `by` of
// every record is a session event of `core/session`: participant, kind, role,
// purpose, `for`, `parent`, software and version, and a certificate — the
// session's public key, an expiry and a signature by a key of the participant.
// In a proposal the session event is `{id, at, body}` (LG-09, G-45). The
// certificate signs the hash of the session event without `sig` (G-46), as a
// commit and a proposal are signed (LG-06, LG-10, G-24). Apply verifies the
// chain from a key the policy lists for the participant, through the
// certificate, to the signature of the proposal by the session key; an
// expired or foreign certificate is rejected. In S0 a `human` or `machine`
// session is certified by the participant's own key; the sessions agents get
// from a caller arrive with S3.
import {
  checkFormat,
  closedForm,
  compareText,
  hash,
  isJsonObject,
  refuse,
  refused,
  reject,
  rejectionsOf,
  STRING,
  type JsonValue,
  type MembersOf,
  type Place,
  type Rejection,
  type Result,
} from "../kernel/index.js";
import type { ParticipantKind, Policy, Writer } from "./policy.js";
import { TR_10, TR_11, TR_12 } from "./rules.js";
import { isPublicKey, signHash, verifyHash, type PublicKey, type SessionKey } from "./signature.js";

/** TR-11: what a session is for. */
export type Purpose = "init" | "work" | "import" | "check" | "bench" | "explore";

/** OB-01: the reason of the work — a requirement, or a finding `{rule, subject}` (TR-34). */
export type Reason =
  | { readonly reason: "requirement"; readonly requirement: string }
  | { readonly reason: "finding"; readonly rule: string; readonly subject: string };

/** TR-11: the certificate of a session — its public key, an expiry, and the signature of the participant's key. */
export type Certificate = { readonly key: PublicKey; readonly expires: string; readonly sig: string };

/** TR-11: the body of a session event of `core/session@1`. */
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

/** TR-11, LG-09: a session event as a proposal carries it — every value of the event that is not computed (G-45). */
export type Session = { readonly id: string; readonly at: string; readonly body: SessionBody };

/** A session before the participant signs its certificate: all that the signature covers (G-46). */
export type UnsignedSession = {
  readonly id: string;
  readonly at: string;
  readonly body: Omit<SessionBody, "certificate"> & { readonly certificate: Omit<Certificate, "sig"> };
};

type Value = JsonValue | undefined;

const isText = (v: Value): v is string => typeof v === "string" && v.length > 0;
const optionalText = (v: Value): v is string | undefined => v === undefined || isText(v);
const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (v: Value): v is T =>
    values.some((x) => x === v);
const same = (v: Value, keys: readonly string[]) => isJsonObject(v) && Object.keys(v).sort().join() === [...keys].sort().join();

const isReason = (v: Value): v is Reason =>
  isJsonObject(v) &&
  ((v.reason === "requirement" && same(v, ["reason", "requirement"]) && isText(v.requirement)) ||
    (v.reason === "finding" && same(v, ["reason", "rule", "subject"]) && isText(v.rule) && isText(v.subject)));

const KINDS: readonly ParticipantKind[] = ["human", "agent", "machine"];
const PURPOSES: readonly Purpose[] = ["init", "work", "import", "check", "bench", "explore"];

/** What the closed form of a session admits: its body as a JSON object, read by `BODY`. */
type SessionFields = Omit<Session, "body"> & { readonly body: JsonValue };
type BodyFields = Omit<SessionBody, "certificate"> & { readonly certificate: JsonValue };

/** TR-11, LG-09: the members of a session event in a proposal; no other field. */
const SESSION: MembersOf<SessionFields> = {
  id: STRING,
  at: STRING,
  body: { expected: "the body of a session", fits: (v): v is JsonValue => isJsonObject(v) },
};

/** TR-11: the members of the body of a session; no other field. */
const BODY: MembersOf<BodyFields> = {
  participant: { expected: "a participant", fits: isText },
  kind: { expected: "human, agent or machine", fits: isOneOf(KINDS) },
  role: { expected: "a role", fits: isText },
  purpose: { expected: "init, work, import, check, bench or explore", fits: isOneOf(PURPOSES) },
  for: { expected: "a reason: {reason: requirement, requirement} or {reason: finding, rule, subject}", fits: (v): v is Reason | undefined => v === undefined || isReason(v) },
  parent: { expected: "a step", fits: optionalText },
  software: { expected: "a software", fits: isText },
  version: { expected: "its version", fits: isText },
  certificate: { expected: "a certificate {key, expires, sig}", fits: (v): v is JsonValue => isJsonObject(v) },
};

/** TR-11: the members of a certificate; no other field. */
const CERTIFICATE: MembersOf<Certificate> = { key: STRING, expires: STRING, sig: STRING };

/** The place of a member under the place of what holds it. */
const under = (place: Place, ...names: readonly string[]): Place => ({ intent: place.intent, path: [place.path, ...names].join("/") });

/** TR-11: the certificate of a session body — its form and the spelling of its expiry (KR-11). */
function readCertificate(v: JsonValue, place: Place): Result<Certificate> {
  const form = isJsonObject(v) ? closedForm(v, CERTIFICATE, TR_11, place) : refuse<Certificate>(reject(TR_11, { ...place, expected: "a certificate", got: v }));
  if (!form.ok) return form;
  return refused<Certificate>(rejectionsOf(checkFormat("date-time", form.value.expires, under(place, "expires")))) ?? form;
}

/** TR-11, OB-01: a session with purpose `init` names no reason. */
const reasonRejections = (b: BodyFields, place: Place): Rejection[] =>
  b.purpose === "init" && b.for !== undefined ? [reject(TR_11, { ...under(place, "for"), expected: "absent: a session with purpose init has no reason", got: b.for })] : [];

/** TR-11: the body of a session — its form, its reason and its certificate. */
function readBody(v: JsonValue, place: Place): Result<SessionBody> {
  const form = isJsonObject(v) ? closedForm(v, BODY, TR_11, place) : refuse<BodyFields>(reject(TR_11, { ...place, expected: "the body of a session", got: v }));
  if (!form.ok) return form;
  const certificate = readCertificate(form.value.certificate, under(place, "certificate"));
  const refusal = refused<SessionBody>([...reasonRejections(form.value, place), ...rejectionsOf(certificate)]);
  return refusal ?? (certificate.ok ? { ok: true, value: { ...form.value, certificate: certificate.value } } : certificate);
}

/**
 * TR-11: the session event a JSON value holds, or the rejections of its form at the place the caller names — where
 * the session sits in its input, `/session` of a proposal.
 */
export function readSession(value: JsonValue, place: Place): Result<Session> {
  if (!isJsonObject(value)) return refuse(reject(TR_11, { ...place, expected: "a session event", got: value }));
  const form = closedForm(value, SESSION, TR_11, place);
  if (!form.ok) return form;
  const body = readBody(form.value.body, under(place, "body"));
  return body.ok ? { ok: true, value: { ...form.value, body: body.value } } : body;
}

/** G-46: the session without the signature of its certificate — what that signature covers. */
function unsigned(s: UnsignedSession | Session): UnsignedSession {
  const { key, expires } = s.body.certificate;
  return { ...s, body: { ...s.body, certificate: { key, expires } } };
}

/** TR-11, G-46: the hash of a session without the signature of its certificate, or the rejections of a session that is not canonical (KR-10). */
export const certificateHash = (s: UnsignedSession | Session, place: Place): Result<string> => hash(unsigned(s), place);

/** TR-11: the session with its certificate signed by the key of its participant. */
export function signSession(s: UnsignedSession | Session, participantKey: SessionKey, place: Place): Result<Session> {
  const covered = unsigned(s);
  const signed = certificateHash(covered, place);
  if (!signed.ok) return signed;
  return { ok: true, value: { ...covered, body: { ...covered.body, certificate: { ...covered.body.certificate, sig: signHash(signed.value, participantKey) } } } };
}

/** A session value with the signature of its certificate set to `sig`, where it has a certificate to hold one. */
function withSignature(value: JsonValue, sig: string): JsonValue {
  if (!isJsonObject(value) || !isJsonObject(value.body) || !isJsonObject(value.body.certificate)) return value;
  return { ...value, body: { ...value.body, certificate: { ...value.body.certificate, sig } } };
}

/**
 * TR-11: a session issued for a `human` or `machine` participant from the JSON value of an unsigned session — read
 * as apply reads a session, at the place the caller names — its certificate signed by the participant's own key; a
 * session of an agent gets its certificate from a caller (S3).
 */
export function issueSession(value: JsonValue, participantKey: SessionKey, place: Place): Result<Session> {
  const read = readSession(withSignature(value, ""), place);
  if (!read.ok) return read;
  const { kind } = read.value.body;
  if (kind === "agent") return refuse(reject(TR_11, { ...under(place, "body", "kind"), expected: "human or machine: an agent session is certified by its caller", got: kind }));
  return signSession(read.value, participantKey, place);
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
 * The chain of a session: the session event as it sits in its input, the policy in `before` (TR-06) that lists the
 * keys of its participant, and the time its expiry is checked against — the source time of the first act counted
 * for the proposal (TR-16), or the `at` of the commit when no act is counted (TR-11).
 */
export type Chain = { readonly session: JsonValue; readonly policy: Policy; readonly at: string };

/**
 * TR-12: verifies the chain from a key in the policy, through the certificate, to the proposal. The session is read
 * (TR-11) at the place the caller names; its certificate must be unexpired at `at` (TR-11) and signed by a key the
 * policy binds to the session's participant, kind and role (TR-12, TR-10). Only then is the last link checked:
 * `proposal` verifies the signature of the proposal by the session key — LG-10, which the ledger gives, so the hash
 * of a proposal stays the ledger's.
 */
export function verifySession<T>(chain: Chain, place: Place, proposal: (sessionKey: PublicKey) => Result<T>): Result<T> {
  const read = readSession(chain.session, place);
  if (!read.ok) return read;
  const signed = certificateHash(read.value, place);
  if (!signed.ok) return signed;
  const found = [...expiryRejections(read.value, chain.at, place), ...sessionKeyRejections(read.value, place), ...chainRejections(read.value, chain.policy, signed.value, place)];
  return refused<T>(found) ?? proposal(read.value.body.certificate.key);
}
