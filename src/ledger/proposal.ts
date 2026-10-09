// A proposal (LG-09): `{session, intents, sig}`, its hash and signature
// (LG-10) and the canonical order of its intents (LG-06, G-03). The form is
// closed: an intent carries every value not computed from the tail, and its
// `by` is the proposal's session, so it holds no `by`, `rev`, `seq` or `hash`.
// The session event `{id, at, body}` with its certificate (TR-11, G-45) is
// read by trust, which verifies the chain of TR-12 to the key that signs the
// proposal; phase 5 of apply runs it (S0-17).
import {
  canon,
  closedForm,
  compareText,
  hash,
  isJsonObject,
  JSON_VALUE,
  refuse,
  refused,
  reject,
  rejectionsOf,
  ROOT,
  STRING,
  type JsonObject,
  type JsonValue,
  type Kind,
  type MembersOf,
  type Place,
  type Result,
} from "../kernel/index.js";
import { signHash, verifyHash, type PublicKey, type SessionKey } from "../trust/index.js";
import { known, unsigned } from "./commit.js";
import { LG_09, LG_10 } from "./rules.js";

/** The authoring session event (TR-11): LG-09 asks only for its `id`; its form is `readSession` of trust (G-45). */
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
const INTENT: MembersOf<Intent> = {
  op: { expected: "entity or event", fits: (v) => v === "entity" || v === "event" },
  id: STRING,
  type: STRING,
  // Whether it is the latest revision is phase 3 of apply (LG-11).
  expected: { expected: "a revision or null", fits: (v) => v === null || typeof v === "number" },
  at: STRING,
  body: JSON_VALUE,
};

/** What the closed form of a proposal admits: its session and signature, and its intents as JSON values, each read as an intent. */
type Fields = Omit<Proposal, "intents"> & { readonly intents: readonly JsonValue[] };

/** LG-09: the members of a proposal; no other field. */
const PROPOSAL: MembersOf<Fields> = {
  session: { expected: "a session event", fits: (v): v is Session => isJsonObject(v) && typeof v.id === "string" },
  intents: { expected: "a list of intents", fits: (v): v is readonly JsonValue[] => Array.isArray(v) },
  // Whether it is a signature (G-10) of the proposal by its session is LG-10.
  sig: { expected: "a signature or null", fits: (v) => v === null || typeof v === "string" },
};

/** G-13: inside an intent with a string `id` the path is the intent's own; otherwise from `root`, where the proposal sits. */
function readIntent(v: JsonValue, i: number, root: Place): Result<Intent> {
  const at: Place = { intent: root.intent, path: `${root.path}/intents/${i}` };
  if (!isJsonObject(v)) return refuse(reject(LG_09, { ...at, expected: "an intent", got: v }));
  return closedForm(v, INTENT, LG_09, typeof v.id === "string" ? { intent: v.id, path: "" } : at);
}

/**
 * LG-09: the proposal a JSON value holds, or the rejections of its form at the place the caller names — where the
 * proposal sits in its input: landing names its file in the tree of the change request (Q-29). Its own fields and
 * every intent it holds are read, even when its own fields are broken. A proposal without intents has the form too
 * (LG-54).
 */
export function readProposal(value: JsonValue, place: Place = ROOT): Result<Proposal> {
  if (!isJsonObject(value)) return refuse(reject(LG_09, { ...place, expected: "a proposal", got: value }));
  const fields = closedForm(value, PROPOSAL, LG_09, place);
  const listed = PROPOSAL.intents.fits(value.intents) ? value.intents : [];
  const intents = listed.map((v, i) => readIntent(v, i, place));
  const refusal = refused<Proposal>([...rejectionsOf(fields), ...intents.flatMap(rejectionsOf)]);
  if (refusal !== null) return refusal;
  return fields.ok ? { ok: true, value: { ...fields.value, intents: intents.flatMap((r) => (r.ok ? [r.value] : [])) } } : fields;
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
type Rank = readonly [group: 0 | 1 | 2, key: string, id: string];

function rankOf(i: Intent, keyOf: KeyOf): Rank {
  if (i.op === "entity") return [0, "", i.id];
  const key = keyOf(i);
  return key === null ? [2, "", i.id] : [1, known(canon(key), "a fact key"), i.id];
}

const compare = (a: Rank, b: Rank): number => a[0] - b[0] || compareText(a[1], b[1]) || compareText(a[2], b[2]);

/**
 * LG-06, G-03: entities by `id`, then facts by the canonical JSON of their key, then the other events by `id`.
 * A commit holds one intent per key (LG-11); between two with one key the `id` decides, so the order is total.
 */
export function canonicalIntents(intents: readonly Intent[], keyOf: KeyOf): Intent[] {
  return intents
    .map((intent) => ({ intent, rank: rankOf(intent, keyOf) }))
    .sort((a, b) => compare(a.rank, b.rank))
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
 * LG-10: the proposal, verified, or the rejection of one whose `sig` is not the signature of its hash by `key`, the
 * key of its session (TR-12), at `/sig` under the place the caller names — where the proposal sits. That the key is
 * the session's is the chain of TR-12: `verifySession` of trust gives this check the key its certificate names.
 */
export function verifyProposal(p: Proposal, key: PublicKey, keyOf: KeyOf, place: Place = ROOT): Result<Proposal> {
  const signed = proposalHash(p, keyOf);
  if (p.sig !== null && verifyHash(signed, p.sig, key)) return { ok: true, value: p };
  return refuse(reject(LG_10, { intent: place.intent, path: `${place.path}/sig`, expected: { hash: signed, key }, got: p.sig }));
}
