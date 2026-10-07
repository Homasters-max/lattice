// A proposal (LG-09): `{session, intents, sig}`. The walking skeleton checks
// its form on the surface — the fields and their JSON kinds; the session
// event with its certificate, the signature and facts in the canonical order
// arrive with S0-10 and S0-16.
import { compareText, gotOf, hash, isJsonObject, reject, refused, type JsonObject, type JsonValue, type Kind, type Rejection, type Result } from "../kernel/index.js";
import { known } from "./commit.js";
import { LG_09 } from "./rules.js";

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

const PROPOSAL: { readonly [field in keyof Proposal]: Field } = {
  session: { expected: "a session event", fits: (v) => isJsonObject(v) && typeof v.id === "string" },
  intents: { expected: "a list of intents", fits: (v) => Array.isArray(v) },
  sig: { expected: "a signature or null", fits: (v) => v === null || typeof v === "string" },
};

const refusal = (intent: string | null, path: string, expected: string, got: JsonValue | undefined) =>
  reject(LG_09, { intent, path, expected, got: gotOf(got) });

/** G-13: inside an intent with a string `id` the path is the intent's own; otherwise from `root`, where the proposal sits. */
function intentRejections(v: JsonValue, i: number, root: string): Rejection[] {
  if (!isJsonObject(v)) return [refusal(null, `${root}/intents/${i}`, "an intent", v)];
  const id = typeof v.id === "string" ? v.id : null;
  return Object.entries(INTENT).flatMap(([name, field]) =>
    field.fits(v[name]) ? [] : [refusal(id, id === null ? `${root}/intents/${i}/${name}` : `/${name}`, field.expected, v[name])],
  );
}

function proposalRejections(value: JsonValue, root: string): Rejection[] {
  if (!isJsonObject(value)) return [refusal(null, root, "a proposal", value)];
  const own = Object.entries(PROPOSAL).flatMap(([name, field]) => (field.fits(value[name]) ? [] : [refusal(null, `${root}/${name}`, field.expected, value[name])]));
  const intents = Array.isArray(value.intents) ? (value.intents as readonly JsonValue[]) : [];
  return [...own, ...intents.flatMap((v, i) => intentRejections(v, i, root))];
}

/**
 * LG-09: the proposal a JSON value holds, or the rejections of its form, refused at `path` — where the proposal
 * sits in its input: landing names its file in the tree of the change request (Q-29).
 */
export function readProposal(value: JsonValue, path = ""): Result<Proposal> {
  // Every field was checked against its kind above, so the value has the shape of Proposal.
  return refused<Proposal>(proposalRejections(value, path)) ?? { ok: true, value: value as Proposal };
}

const order = (a: Intent, b: Intent) => (a.op === b.op ? compareText(a.id, b.id) : a.op === "entity" ? -1 : 1);

/** LG-06, G-03: entities by `id`, then events by `id`; the group of facts by key arrives with S0-10. */
export const canonicalIntents = (intents: readonly Intent[]): Intent[] => [...intents].sort(order);

/** LG-10: the hash of a proposal without `sig`, with intents in canonical order; the proposal is canonical (KR-10) as phase 1 of apply finds it. */
export function proposalHash(p: Proposal): string {
  return known(hash({ session: p.session, intents: canonicalIntents(p.intents) }), "a proposal");
}
