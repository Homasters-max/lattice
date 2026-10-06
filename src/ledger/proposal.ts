// A proposal (LG-09): `{session, intents, sig}`. The walking skeleton checks
// its form on the surface — the fields and their JSON kinds; the session
// event with its certificate, the signature and facts in the canonical order
// arrive with S0-10 and S0-16.
import { compareText, hash, isJsonObject, reject, refused, type JsonObject, type JsonValue, type Kind, type Rejection, type Result } from "../kernel/index.js";
import { LG_09 } from "./rules.js";

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

const kindOf = (v: JsonValue | undefined): string =>
  v === undefined ? "absent" : v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

type Field = { readonly expected: string; readonly fits: (v: JsonValue | undefined) => boolean };

const STRING: Field = { expected: "a string", fits: (v) => typeof v === "string" };

const INTENT: { readonly [field in keyof Intent]: Field } = {
  op: { expected: "entity or event", fits: (v) => v === "entity" || v === "event" },
  id: STRING,
  type: STRING,
  expected: { expected: "a revision or null", fits: (v) => v === null || typeof v === "number" },
  at: STRING,
  body: { expected: "a JSON value", fits: (v) => v !== undefined },
};

const PROPOSAL: { readonly [field: string]: Field } = {
  session: { expected: "a session event", fits: (v) => isJsonObject(v) && typeof v.id === "string" },
  intents: { expected: "a list of intents", fits: (v) => Array.isArray(v) },
  sig: { expected: "a signature or null", fits: (v) => v === null || typeof v === "string" },
};

const at = (intent: string | null, path: string, field: Field, got: JsonValue | undefined) =>
  reject(LG_09, { intent, path, expected: field.expected, got: kindOf(got) });

/** G-13: inside an intent with a string `id` the path is the intent's own; otherwise from the root. */
function intentRejections(v: JsonValue, i: number): Rejection[] {
  if (!isJsonObject(v)) return [at(null, `/intents/${i}`, { expected: "an intent", fits: () => false }, v)];
  const id = typeof v.id === "string" ? v.id : null;
  return Object.entries(INTENT).flatMap(([name, field]) =>
    field.fits(v[name]) ? [] : [at(id, id === null ? `/intents/${i}/${name}` : `/${name}`, field, v[name])],
  );
}

function proposalRejections(value: JsonValue): Rejection[] {
  if (!isJsonObject(value)) return [at(null, "", { expected: "a proposal", fits: () => false }, value)];
  const own = Object.entries(PROPOSAL).flatMap(([name, field]) => (field.fits(value[name]) ? [] : [at(null, `/${name}`, field, value[name])]));
  const intents = Array.isArray(value.intents) ? (value.intents as readonly JsonValue[]) : [];
  return [...own, ...intents.flatMap(intentRejections)];
}

/** LG-09: the proposal a JSON value holds, or the rejections of its form. */
export function readProposal(value: JsonValue): Result<Proposal> {
  // Every field was checked against its kind above, so the value has the shape of Proposal.
  return refused<Proposal>(proposalRejections(value)) ?? { ok: true, value: value as Proposal };
}

const order = (a: Intent, b: Intent) => (a.op === b.op ? compareText(a.id, b.id) : a.op === "entity" ? -1 : 1);

/** LG-06, G-03: entities by `id`, then events by `id`; the group of facts by key arrives with S0-10. */
export const canonicalIntents = (intents: readonly Intent[]): Intent[] => [...intents].sort(order);

/** LG-10: the hash of a proposal without `sig`, with intents in canonical order. */
export function proposalHash(p: Proposal): string {
  return hash({ session: p.session, intents: canonicalIntents(p.intents) });
}
