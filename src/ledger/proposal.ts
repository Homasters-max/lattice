// A proposal (LG-09): `{session, intents, sig}`. The walking skeleton reads
// only a well-formed proposal; refusing a malformed one with its rule ID, the
// canonical order of intents and the signature arrive with S0-10.
import { hash, type JsonObject, type JsonValue, type Kind } from "../kernel/index.js";

/** The authoring session event (TR-11); its certificate arrives with S0-16. */
export type Session = JsonObject & { readonly id: string };

export type Intent = {
  readonly op: Kind;
  readonly id: string;
  readonly type: string;
  readonly expected: number | null;
  readonly at: string;
  readonly body: JsonValue;
};

export type Proposal = {
  readonly session: Session;
  readonly intents: readonly Intent[];
  readonly sig: string | null;
};

const isObject = (v: JsonValue | undefined): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: JsonValue | undefined) => typeof v === "string";

const INTENT: { readonly [field in keyof Intent]: (v: JsonValue | undefined) => boolean } = {
  op: (v) => v === "entity" || v === "event",
  id: isString,
  type: isString,
  expected: (v) => v === null || typeof v === "number",
  at: isString,
  body: (v) => v !== undefined,
};

function unreadable(what: string): never {
  throw new Error(`not in the walking skeleton: refusing ${what} (LG-09) arrives with S0-10`);
}

function readIntent(v: JsonValue): Intent {
  if (!isObject(v) || !Object.entries(INTENT).every(([field, fits]) => fits(v[field]))) unreadable("a malformed intent");
  return v as Intent;
}

/** The proposal a JSON value holds. */
export function readProposal(value: JsonValue): Proposal {
  if (!isObject(value) || !Array.isArray(value.intents)) return unreadable("a proposal without intents");
  const { session, intents, sig } = value;
  if (!isObject(session) || !isString(session.id)) return unreadable("a proposal without a session id");
  if (sig !== null && !isString(sig)) return unreadable("a malformed sig");
  return { session: session as Session, intents: (intents as readonly JsonValue[]).map(readIntent), sig };
}

/** LG-10: the hash of a proposal without `sig`. */
export function proposalHash(p: Proposal): string {
  return hash({ session: p.session, intents: p.intents });
}
