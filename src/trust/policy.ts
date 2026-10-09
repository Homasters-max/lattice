// A namespace and its policy (TR-01, TR-02, TR-05): the entity
// `<name>/namespace` owns the entity ids with the prefix `<name>` (KR-06), and
// its body is the policy — its owner, writers, roles, pins, acts, recovery,
// delegation, labels, budget and quality. Ownership exists only at namespace
// level: the owner of an entity is the owner of its namespace. Policy and owner
// are read in `before` of the commit being judged (TR-06), so a change of
// policy applies from the next commit. A writer entry (TR-09, TR-10) names one
// participant with its identities, its Ed25519 keys and the roles its keys may
// take or grant. `delegation` is read and means nothing until S3 (TR-18),
// `budget` until S1 (RT-19).
import {
  closedForm,
  isJsonObject,
  refuse,
  refused,
  reject,
  rejectionsOf,
  type JsonValue,
  type MembersOf,
  type Place,
  type Record,
  type Rejection,
  type Result,
} from "../kernel/index.js";
import { TR_02, TR_09, TR_10 } from "./rules.js";
import { isPublicKey, type PublicKey } from "./signature.js";

/** TR-07: the kind of a participant. */
export type ParticipantKind = "human" | "agent" | "machine";

/** TR-09, TR-10: a writer entry — one participant, its identities, its keys and the roles they may take or grant. */
export type Writer = {
  readonly participant: string;
  readonly kind: ParticipantKind;
  readonly identities?: readonly string[];
  readonly keys?: readonly PublicKey[];
  readonly roles?: readonly string[];
  readonly grants?: readonly string[];
};

/** TR-08, AG-08: what a role may write — types and repository paths. */
export type RoleRights = { readonly types?: readonly string[]; readonly paths?: readonly string[] };

/** LG-44: the LATTICE version and the libraries a namespace pins. */
export type Pins = {
  readonly lattice: string;
  readonly libraries?: readonly { readonly name: string; readonly version: string; readonly hash: string }[];
};

/** TR-42: an act requirement beyond the floor. */
export type ActRequirement = { readonly match: readonly string[]; readonly from: readonly string[]; readonly count?: number };

/** TR-17: who may replace the owner in a transfer, and how many of them. */
export type Recovery = { readonly participants: readonly string[]; readonly count: number };

/** RT-19: the ceiling of a run budget. */
export type Budget = { readonly ms?: number; readonly tokens?: number; readonly usd?: string; readonly calls?: number };

/** TR-02: the namespace policy — the body of the namespace entity, of the type `std/namespace-policy@1`. */
export type Policy = {
  readonly supersedes?: readonly string[];
  readonly owner: string;
  readonly writers?: readonly Writer[];
  readonly roles?: { readonly [role: string]: RoleRights };
  readonly pins?: Pins;
  readonly acts?: readonly ActRequirement[];
  readonly recovery?: Recovery;
  readonly delegation?: readonly string[];
  readonly labels?: { readonly [label: string]: string };
  readonly budget?: Budget;
  readonly quality?: string;
};

type Value = JsonValue | undefined;

const isText = (v: Value): v is string => typeof v === "string" && v.length > 0;
const isTexts = (v: Value): v is readonly string[] => Array.isArray(v) && v.every(isText);
const isCount = (v: Value): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const isSize = (v: Value): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
/** An optional member: absent, or of its form. */
const optional =
  <V extends JsonValue>(fits: (v: Value) => v is V) =>
  (v: Value): v is V | undefined =>
    v === undefined || fits(v);
const isObjectOf = <V extends JsonValue>(v: Value, fits: (inner: Value) => inner is V): v is { readonly [key: string]: V } =>
  isJsonObject(v) && Object.values(v).every(fits);
/** An object whose fields are each of their form — absent where optional — and no other. */
const hasOnly = (v: Value, fields: { readonly [name: string]: (inner: Value) => boolean }): boolean =>
  isJsonObject(v) && Object.keys(v).every((k) => Object.hasOwn(fields, k)) && Object.entries(fields).every(([k, fits]) => fits(v[k]));

const isRoleRights = (v: Value): v is RoleRights => hasOnly(v, { types: optional(isTexts), paths: optional(isTexts) });
const isLibrary = (v: Value) => hasOnly(v, { name: isText, version: isText, hash: isText });
const isPins = (v: Value): v is Pins =>
  hasOnly(v, { lattice: isText, libraries: (l) => l === undefined || (Array.isArray(l) && l.every(isLibrary)) });
const isAct = (v: Value) => hasOnly(v, { match: isTexts, from: isTexts, count: optional(isCount) });
const isActs = (v: Value): v is readonly ActRequirement[] => Array.isArray(v) && v.every(isAct);
const isRecovery = (v: Value): v is Recovery => hasOnly(v, { participants: isTexts, count: isCount });
const isBudget = (v: Value): v is Budget => hasOnly(v, { ms: optional(isSize), tokens: optional(isSize), usd: optional(isText), calls: optional(isSize) });

/** What the closed form of a policy admits: its writers as JSON values, each read as a writer entry. */
type Fields = Omit<Policy, "writers"> & { readonly writers?: readonly JsonValue[] };

/** TR-02: the members of a policy, as `std/namespace-policy@1` gives them; no other field. */
const POLICY: MembersOf<Fields> = {
  supersedes: { expected: "a list of references", fits: optional(isTexts) },
  owner: { expected: "a participant", fits: isText },
  writers: { expected: "a list of writer entries", fits: (v): v is readonly JsonValue[] | undefined => v === undefined || Array.isArray(v) },
  roles: { expected: "the rights of each role: {types?, paths?}", fits: optional((v) => isObjectOf(v, isRoleRights)) },
  pins: { expected: "{lattice, libraries?}", fits: optional(isPins) },
  acts: { expected: "a list of act requirements {match, from, count?}", fits: optional(isActs) },
  recovery: { expected: "{participants, count}", fits: optional(isRecovery) },
  delegation: { expected: "a list of types", fits: optional(isTexts) },
  labels: { expected: "the meaning of each label", fits: optional((v) => isObjectOf(v, isText)) },
  budget: { expected: "{ms?, tokens?, usd?, calls?}", fits: optional(isBudget) },
  quality: { expected: "a quality profile", fits: optional(isText) },
};

const KINDS: readonly ParticipantKind[] = ["human", "agent", "machine"];

/** TR-09, TR-10: the members of a writer entry; no other field. */
const WRITER: MembersOf<Writer> = {
  participant: { expected: "a participant", fits: isText },
  kind: { expected: "human, agent or machine", fits: (v): v is ParticipantKind => KINDS.some((k) => k === v) },
  identities: { expected: "a list of identities", fits: optional(isTexts) },
  keys: { expected: "a list of public keys", fits: optional(isTexts) },
  roles: { expected: "a list of roles", fits: optional(isTexts) },
  grants: { expected: "a list of roles", fits: optional(isTexts) },
};

/** The place of a member or an item under the place of what holds it. */
const under = (place: Place, name: string | number): Place => ({ intent: place.intent, path: `${place.path}/${name}` });

// TR-09: the identities a writer acts through; an `ssh:` identity is the fingerprint `ssh-keygen -l` prints.
const IDENTITY = /^(?:github:[A-Za-z0-9-]+|gitlab:[A-Za-z0-9._-]+|ssh:SHA256:[A-Za-z0-9+/]{43})$/;

/** TR-09: every identity of a writer is one of a forge or of a key. */
function identityRejections(w: Writer, place: Place): Rejection[] {
  return (w.identities ?? []).flatMap((id, i) =>
    IDENTITY.test(id) ? [] : [reject(TR_09, { ...under(under(place, "identities"), i), expected: "github:<login>, gitlab:<user> or ssh:SHA256:<fingerprint>", got: id })],
  );
}

/** TR-10: the keys of a writer are Ed25519 in OpenSSH format, and an agent holds none (TR-12). */
function keyRejections(w: Writer, place: Place): Rejection[] {
  const keys = w.keys ?? [];
  if (w.kind === "agent" && keys.length > 0) return [reject(TR_10, { ...under(place, "keys"), expected: "no key: an agent holds only its session key", got: [...keys] })];
  return keys.flatMap((k, i) => (isPublicKey(k) ? [] : [reject(TR_10, { ...under(under(place, "keys"), i), expected: "ssh-ed25519 <base64> [comment]", got: k })]));
}

/** TR-09, TR-10: a writer entry — its form, its identities and its keys. */
function readWriter(v: JsonValue, place: Place): Result<Writer> {
  if (!isJsonObject(v)) return refuse(reject(TR_02, { ...place, expected: "a writer entry", got: v }));
  const form = closedForm(v, WRITER, TR_02, place);
  if (!form.ok) return form;
  return refused<Writer>([...identityRejections(form.value, place), ...keyRejections(form.value, place)]) ?? form;
}

/**
 * TR-02: the policy a namespace body holds, or the rejections of its fields at the place the caller names — where
 * the body sits; every writer entry is read, with its identities (TR-09) and keys (TR-10), even when other fields are
 * broken.
 */
export function readPolicy(value: JsonValue, place: Place): Result<Policy> {
  if (!isJsonObject(value)) return refuse(reject(TR_02, { ...place, expected: "a namespace policy", got: value }));
  const fields = closedForm(value, POLICY, TR_02, place);
  const listed = POLICY.writers.fits(value.writers) ? (value.writers ?? []) : [];
  const writers = listed.map((w, i) => readWriter(w, under(under(place, "writers"), i)));
  const refusal = refused<Policy>([...rejectionsOf(fields), ...writers.flatMap(rejectionsOf)]);
  if (refusal !== null) return refusal;
  if (!fields.ok) return fields;
  const { writers: entries, ...rest } = fields.value;
  return { ok: true, value: entries === undefined ? rest : { ...rest, writers: writers.flatMap((w) => (w.ok ? [w.value] : [])) } };
}

/** TR-01, KR-06: the namespace an entity id belongs to — its prefix — or `null` for an event id, which has none. */
export function namespaceOf(id: string): string | null {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : null;
}

/** TR-01: the id of the namespace entity of a namespace. */
export const namespaceId = (namespace: string): string => `${namespace}/namespace`;

/** What the policy is read in: `before` of the commit being judged (TR-06, LG-15) — a read view, by its current revisions. */
export interface Before {
  current(id: string): Record | null;
}

/**
 * TR-06: the policy of a namespace as it stood before the commit being judged — the body of the current revision of
 * its namespace entity in `before` — or `null` where `before` holds no such namespace. Rejections of the body are at
 * the place the caller names.
 */
export function policyOf(before: Before, namespace: string, place: Place): Result<Policy | null> {
  const record = before.current(namespaceId(namespace));
  return record === null ? { ok: true, value: null } : readPolicy(record.body, place);
}

/** TR-05, GL-07: the owner of an entity — the owner of its namespace in `before` — or `null` where there is none. */
export function ownerOf(before: Before, id: string, place: Place): Result<string | null> {
  const namespace = namespaceOf(id);
  const policy = namespace === null ? null : policyOf(before, namespace, place);
  if (policy === null || !policy.ok) return policy ?? { ok: true, value: null };
  return { ok: true, value: policy.value?.owner ?? null };
}
