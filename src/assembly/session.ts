// Starting a session (TR-11, RT-32): the store command `session` issues a
// session event and its certificate. The id of the session and its time come
// from the ports `ids` and `clock` (ST-04); the session key is a new Ed25519
// key; the certificate is signed by the participant's own key, read from an
// unencrypted OpenSSH key file (Q-04). `cli` reads and writes the files.
import { generateKeyPairSync } from "node:crypto";
import { canon, KERNEL_VERSION, ROOT, type JsonObject, type Rejections, type ResolveType } from "../kernel/index.js";
import { SESSION_TYPE, type Clock, type Ids } from "../ledger/index.js";
import { issueSession, publicKeyOf, readOpenSshKey, type Session } from "../trust/index.js";

/** What the command `session` asks for: the fields of the session (TR-11) and the participant's key file. */
export type SessionRequest = {
  readonly participant: string;
  readonly kind: string;
  readonly role: string;
  readonly purpose: string;
  /** The requirement the work is for (OB-01); none for purpose `init`. */
  readonly requirement?: string;
  readonly parent?: string;
  readonly software?: string;
  readonly version?: string;
  /** How long the certificate holds, from the start of the session. */
  readonly hours: number;
  /** The text of the participant's unencrypted OpenSSH private key file (Q-04). */
  readonly participantKey: string;
};

/** How starting a session ends: the session, its canonical JSON and its key as PKCS #8 PEM; its rejections; or a key file that is no key. */
export type SessionOutcome =
  | { readonly outcome: "session"; readonly session: Session; readonly text: string; readonly key: string }
  | { readonly outcome: "rejections"; readonly rejections: Rejections }
  | { readonly outcome: "not-a-key" };

/** `at` plus whole hours, in the spelling of KR-11 that `at` has: its fraction digits are kept. */
function later(at: string, hours: number): string {
  const ms = Date.parse(`${at.slice(0, 19)}Z`) + hours * 3_600_000;
  return `${new Date(ms).toISOString().slice(0, 19)}${at.slice(19)}`;
}

/** The session event the request asks for, unsigned: its certificate names the new session key. */
function unsigned(request: SessionRequest, ports: { readonly clock: Clock; readonly ids: Ids }, sessionKey: string): JsonObject {
  const at = ports.clock.now();
  const reason = request.requirement === undefined ? {} : { for: { reason: "requirement", requirement: request.requirement } };
  const body = {
    participant: request.participant,
    kind: request.kind,
    role: request.role,
    purpose: request.purpose,
    ...reason,
    ...(request.parent === undefined ? {} : { parent: request.parent }),
    software: request.software ?? "lattice",
    version: request.version ?? KERNEL_VERSION,
    certificate: { key: sessionKey, expires: later(at, request.hours) },
  };
  return { id: ports.ids.ulid(), at, body };
}

/** KR-21: the one type a session is read against before a store is open — the session type ledger code makes (LG-47). */
const SESSION_TYPES: ResolveType = (ref) => (ref === `${SESSION_TYPE.id}@${SESSION_TYPE.rev}` ? SESSION_TYPE.body : null);

/** TR-11: starts a session — a new session key, a session event with its certificate signed by the participant's key. */
export function startSession(ports: { readonly clock: Clock; readonly ids: Ids }, request: SessionRequest): SessionOutcome {
  const participantKey = readOpenSshKey(request.participantKey);
  if (participantKey === null) return { outcome: "not-a-key" };
  const { privateKey } = generateKeyPairSync("ed25519");
  const issued = issueSession(unsigned(request, ports, publicKeyOf(privateKey)), participantKey, SESSION_TYPES, ROOT);
  if (!issued.ok) return { outcome: "rejections", rejections: issued.rejections };
  const text = canon(issued.value);
  if (!text.ok) throw new Error("bug: an issued session is canonical");
  return { outcome: "session", session: issued.value, text: text.value, key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}
