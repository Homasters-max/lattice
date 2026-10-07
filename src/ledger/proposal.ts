// A proposal (LG-09): `{session, intents, sig}`, its hash and signature
// (LG-10) and the canonical order of its intents (LG-06, G-03). The form is
// closed: an intent carries every value not computed from the tail, and its
// `by` is the proposal's session, so it holds no `by`, `rev`, `seq` or `hash`.
// The session event with its certificate and the chain of TR-12 arrive with
// S0-16.
import {
  canon,
  closedRejections,
  compareText,
  hash,
  isJsonObject,
  JSON_VALUE,
  reject,
  refused,
  STRING,
  type JsonObject,
  type JsonValue,
  type Kind,
  type Member,
  type Rejection,
  type Result,
} from "../kernel/index.js";
import { signHash, verifyHash, type PublicKey, type SessionKey } from "../trust/index.js";
import { known, unsigned } from "./commit.js";
import { LG_09, LG_10 } from "./rules.js";

/** The authoring session event (TR-11); its certificate arrives with S0-16. */
type Session = JsonObject & { readonly id: string };

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

/** LG-09: the members of an intent; no other field. */
const INTENT: { readonly [field in keyof Intent]: Member } = {
  op: { expected: "entity or event", fits: (v) => v === "entity" || v === "event" },
  id: STRING,
  type: STRING,
  // Whether it is the latest revision is phase 3 of apply (LG-11).
  expected: { expected: "a revision or null", fits: (v) => v === null || typeof v === "number" },
  at: STRING,
  body: JSON_VALUE,
};

/** LG-09: the members of a proposal; no other field. */
const PROPOSAL: { readonly [field in keyof Proposal]: Member } = {
  session: { expected: "a session event", fits: (v) => isJsonObject(v) && typeof v.id === "string" },
  intents: { expected: "a list of intents", fits: (v) => Array.isArray(v) },
  // Whether it is a signature (G-10) of the proposal by its session is LG-10.
  sig: { expected: "a signature or null", fits: (v) => v === null || typeof v === "string" },
};

/** G-13: inside an intent with a string `id` the path is the intent's own; otherwise from `root`, where the proposal sits. */
function intentRejections(v: JsonValue, i: number, root: string): Rejection[] {
  const at = `${root}/intents/${i}`;
  if (!isJsonObject(v)) return [reject(LG_09, { intent: null, path: at, expected: "an intent", got: v })];
  return closedRejections(v, INTENT, LG_09, typeof v.id === "string" ? { intent: v.id, path: "" } : { intent: null, path: at });
}

function proposalRejections(value: JsonValue, root: string): Rejection[] {
  if (!isJsonObject(value)) return [reject(LG_09, { intent: null, path: root, expected: "a proposal", got: value })];
  const own = closedRejections(value, PROPOSAL, LG_09, { intent: null, path: root });
  const intents = Array.isArray(value.intents) ? (value.intents as readonly JsonValue[]) : [];
  return [...own, ...intents.flatMap((v, i) => intentRejections(v, i, root))];
}

/**
 * LG-09: the proposal a JSON value holds, or the rejections of its form, refused at `path` — where the proposal
 * sits in its input: landing names its file in the tree of the change request (Q-29). A proposal without
 * intents has the form too (LG-54).
 */
export function readProposal(value: JsonValue, path = ""): Result<Proposal> {
  // Every field was checked against its kind above, so the value has the shape of Proposal.
  return refused<Proposal>(proposalRejections(value, path)) ?? { ok: true, value: value as Proposal };
}

/**
 * G-03: the fact key of an intent — the fields its type declares `key` (KR-19, TR-28) — or `null` for an entity
 * or an event that is no fact. The type says it, so the caller that knows the types gives it.
 */
export type KeyOf = (intent: Intent) => JsonValue | null;

/**
 * No intent is a fact. Apply and landing order by it until they read the `key` annotations of types from `before`
 * (S0-13): until then no type of a store declares one.
 */
export const NO_FACTS: KeyOf = () => null;

/** Where an intent stands in canonical order: its group, its fact key as canonical JSON, its `id`. */
type Place = readonly [group: 0 | 1 | 2, key: string, id: string];

function placeOf(i: Intent, keyOf: KeyOf): Place {
  if (i.op === "entity") return [0, "", i.id];
  const key = keyOf(i);
  return key === null ? [2, "", i.id] : [1, known(canon(key), "a fact key"), i.id];
}

const compare = (a: Place, b: Place): number => a[0] - b[0] || compareText(a[1], b[1]) || compareText(a[2], b[2]);

/**
 * LG-06, G-03: entities by `id`, then facts by the canonical JSON of their key, then the other events by `id`.
 * A commit holds one intent per key (LG-11); between two with one key the `id` decides, so the order is total.
 */
export function canonicalIntents(intents: readonly Intent[], keyOf: KeyOf): Intent[] {
  return intents
    .map((intent) => ({ intent, place: placeOf(intent, keyOf) }))
    .sort((a, b) => compare(a.place, b.place))
    .map(({ intent }) => intent);
}

/** LG-10: the hash of a proposal without `sig`, with intents in canonical order; the proposal is canonical (KR-10) as phase 1 of apply finds it. */
export function proposalHash(p: Proposal, keyOf: KeyOf): string {
  return known(hash({ ...unsigned(p, PROPOSAL), intents: canonicalIntents(p.intents, keyOf) }), "a proposal");
}

/** LG-10: the proposal signed by the key of its session (TR-12): `sig` is the signature of its hash. */
export function signProposal(p: Proposal, sessionKey: SessionKey, keyOf: KeyOf): Proposal {
  return { ...p, sig: signHash(proposalHash(p, keyOf), sessionKey) };
}

/**
 * LG-10: the rejection of a proposal whose `sig` is not the signature of its hash by `key`, the key of its session
 * (TR-12), refused at `path`, where the proposal sits. That the key is the session's is the chain of TR-12 (S0-16).
 */
export function verifyProposal(p: Proposal, key: PublicKey, keyOf: KeyOf, path = ""): Rejection[] {
  const signed = proposalHash(p, keyOf);
  if (p.sig !== null && verifyHash(signed, p.sig, key)) return [];
  return [reject(LG_10, { intent: null, path: `${path}/sig`, expected: { hash: signed, key }, got: p.sig })];
}
