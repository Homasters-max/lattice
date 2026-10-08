// The session type `core/session` (TY-01, TR-11): the type of `by` of every
// record (KR-08). It is data of the ledger, not of `std`: ledger code writes
// it into the genesis commit of every ledger beside the meta-type (LG-47), so
// a ledger can name who wrote its first records before it sees any library
// (KR-03: a type of `core` changes only with a kernel version). It names no
// `std` type — `std` is not visible in genesis — so its references carry no
// annotation `ref` (G-31). Its hash covers its type and body (KR-12) and is a
// constant of the kernel version, as the meta-type's is.
import { hashRecord, META_TYPE, type JsonValue, type Record } from "../kernel/index.js";

/** A type record as ledger code makes it for genesis: everything but `by` and `at`, which genesis gives (LG-47). */
type GenesisType = Omit<Record, "by" | "at">;

const TEXT = { type: "string", minLength: 1 } as const;

const REASON: JsonValue = {
  oneOf: [
    {
      type: "object",
      properties: { reason: { const: "requirement" }, requirement: { type: "string", format: "ref", description: "the requirement the work is for" } },
      required: ["reason", "requirement"],
    },
    {
      type: "object",
      properties: {
        reason: { const: "finding" },
        rule: { ...TEXT, description: "the rule ID of the finding (TR-34)" },
        subject: { type: "string", format: "ref", description: "the subject of the finding" },
      },
      required: ["reason", "rule", "subject"],
    },
  ],
  discriminator: "reason",
  description: "the reason of the work: a requirement or a finding {rule, subject} (OB-01); none for purpose init",
};

const CERTIFICATE: JsonValue = {
  type: "object",
  properties: {
    key: { ...TEXT, description: "the public key of the session, Ed25519 in OpenSSH format (TR-10)" },
    expires: { type: "string", format: "date-time", description: "the expiry of the certificate (TR-11)" },
    sig: { ...TEXT, description: "the signature by a key of the participant that grants the session (TR-11, TR-12)" },
  },
  required: ["key", "expires", "sig"],
  description: "the certificate of the session (TR-11)",
};

/** TR-11: the body of `core/session@1` — an event type, not abstract, with no parent. */
const BODY: JsonValue = {
  abstract: false,
  kind: "event",
  schema: {
    type: "object",
    properties: {
      participant: { ...TEXT, description: "the participant of the session (TR-07)" },
      kind: { enum: ["human", "agent", "machine"], description: "the kind of the participant (TR-07)" },
      role: { ...TEXT, description: "the one role the session acts in (TR-08)" },
      purpose: { enum: ["init", "work", "import", "check", "bench", "explore"], description: "the purpose of the session (TR-11)" },
      for: REASON,
      parent: { type: "string", format: "ulid", description: "the step that opened the session (OB-02)" },
      software: { ...TEXT, description: "the software of the session" },
      version: { ...TEXT, description: "the version of that software" },
      certificate: CERTIFICATE,
    },
    required: ["participant", "kind", "role", "purpose", "software", "version", "certificate"],
  },
};

const TYPE = "core/session";

function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) for (const inner of Object.values(value)) frozen(inner);
  return Object.freeze(value);
}

function make(): GenesisType {
  const hash = hashRecord(META_TYPE.type, BODY);
  if (!hash.ok) throw new Error("bug: the body of the session type must be canonical");
  return frozen({ id: TYPE, rev: 1, type: META_TYPE.type, hash: hash.value, body: BODY });
}

/** TY-01, TR-11: the record of the session type `core/session@1` as ledger code makes it. */
export const SESSION_TYPE: GenesisType = make();
