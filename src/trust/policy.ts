// A namespace and its policy (TR-01, TR-02, TR-05): the entity
// `<name>/namespace` owns the entity ids with the prefix `<name>` (KR-06), and
// its body is the policy — its owner, writers, roles, pins, acts, recovery,
// delegation, labels, budget and quality. The body has one form, the schema of
// its type `std/namespace-policy@1`, which admitted it when it was written
// (KR-21, LG-47); trust reads that body and refuses only what the schema does
// not say: the identities of a writer (TR-09), its keys and that an agent holds
// none (TR-10). Ownership exists only at namespace level: the owner of an
// entity is the owner of its namespace. Policy and owner are read in `before`
// of the commit being judged (TR-06), so a change of policy applies from the
// next commit. `delegation` is read and means nothing until S3 (TR-18),
// `budget` until S1 (RT-19).
import { isJsonObject, refused, reject, type JsonValue, type Place, type Record, type Rejection, type Result } from "../kernel/index.js";
import { TR_09, TR_10 } from "./rules.js";
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

/** TR-02: the namespace policy — the body of the namespace entity, as its type `std/namespace-policy@1` admits it. */
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

/** TR-01, LG-47: the type of a namespace entity, whose schema is the form of `Policy`. */
const POLICY_TYPE = "std/namespace-policy@1";

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

/**
 * TR-02, TR-09, TR-10: the policy a namespace body holds — a body its type `std/namespace-policy@1` admitted (KR-21)
 * — or the rejections of what that schema does not say, at the place the caller names, where the body sits: the
 * identities of every writer entry (TR-09), its keys and that an agent holds none (TR-10).
 */
export function readPolicy(body: JsonValue, place: Place): Result<Policy> {
  if (!isJsonObject(body)) throw new Error("bug: a policy is read from a body its type admitted, an object");
  // The type admitted the body: its schema is the form of Policy, and its objects are closed (KR-18).
  const policy = body as Policy;
  const writer = (i: number) => under(under(place, "writers"), i);
  const found = (policy.writers ?? []).flatMap((w, i) => [...identityRejections(w, writer(i)), ...keyRejections(w, writer(i))]);
  return refused<Policy>(found) ?? { ok: true, value: policy };
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
 * its namespace entity in `before` — or `null` where `before` holds no such namespace, or a record of another type at
 * its id (G-49). Rejections of the body are at the place the caller names.
 */
export function policyOf(before: Before, namespace: string, place: Place): Result<Policy | null> {
  const record = before.current(namespaceId(namespace));
  return record === null || record.type !== POLICY_TYPE ? { ok: true, value: null } : readPolicy(record.body, place);
}

/** TR-05, GL-07: the owner of an entity — the owner of its namespace in `before` — or `null` where there is none. */
export function ownerOf(before: Before, id: string, place: Place): Result<string | null> {
  const namespace = namespaceOf(id);
  const policy = namespace === null ? null : policyOf(before, namespace, place);
  if (policy === null || !policy.ok) return policy ?? { ok: true, value: null };
  return { ok: true, value: policy.value?.owner ?? null };
}
