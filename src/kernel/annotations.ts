// Annotations (KR-19), part of the closed subset: each sits only where the
// rule puts it and has one form (G-23). A field is a member of `properties`,
// at any depth; the root, `items`, `values` and a branch of `oneOf` are not
// fields. `ref` and `edge` sit on any schema of their format, an item of an
// array of references too. That `ref.to` names a type and `label` a known
// edge label is a question of phase 4 (RF-07); positions of `card_order` along
// the `extends` chain, of the Type check (S0-07).
import type { Kind } from "./id.js";
import { gotOf, isJsonObject, pointer, type JsonObject, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { reject, type Rejection } from "./rejection.js";
import { KR_19 } from "./rules.js";

/** Where a schema sits in the schema of a type: a field — required or not — or another place. */
export type Site = {
  readonly schema: JsonObject;
  readonly path: string;
  readonly site: "root" | "field" | "items" | "values" | "branch";
  readonly required: boolean;
};

/** What a check of a schema knows besides the schema: the kind of the type and the intent refusals are about. */
export type Context = { readonly kind: Kind; readonly intent: string | null };

/** A broken part of an annotation: a member of it, or `null` for the whole, what was expected and what came. */
type Fault = { readonly key: string | null; readonly expected: JsonValue; readonly got: JsonValue };

type Annotation = {
  readonly on: (site: Site, kind: Kind) => boolean;
  readonly where: string;
  readonly faults: (value: JsonValue) => readonly Fault[];
};

/** An annotation whose whole value has one form. */
const one =
  (expected: JsonValue, fits: (v: JsonValue) => boolean) =>
  (value: JsonValue): readonly Fault[] =>
    fits(value) ? [] : [{ key: null, expected, got: value }];

const PINS: readonly JsonValue[] = ["pinned", "floating", "any"];

type Member = { readonly expected: JsonValue; readonly fits: (v: JsonValue | undefined) => boolean };

/** KR-19: `ref: {to, pin, label}` — every member present, nothing else. */
const REF: { readonly [member: string]: Member } = {
  to: { expected: "a pinned reference to a type, type@n", fits: (v) => typeof v === "string" && isPinned(v) },
  pin: { expected: PINS, fits: (v) => v !== undefined && PINS.includes(v) },
  label: { expected: "an edge label", fits: (v) => typeof v === "string" },
};

function refFaults(value: JsonValue): readonly Fault[] {
  if (!isJsonObject(value)) return [{ key: null, expected: "{to, pin, label}", got: value }];
  const extra = Object.keys(value)
    .filter((k) => !Object.hasOwn(REF, k))
    .map((k): Fault => ({ key: k, expected: "absent", got: gotOf(value[k]) }));
  const members = Object.entries(REF)
    .filter(([k, m]) => !m.fits(value[k]))
    .map(([k, m]): Fault => ({ key: k, expected: m.expected, got: gotOf(value[k]) }));
  return [...extra, ...members];
}

const isField = (s: Site): boolean => s.site === "field";

const ANNOTATIONS: { readonly [name: string]: Annotation } = {
  ref: { on: (s) => s.schema.format === "ref", where: "a format: ref schema", faults: refFaults },
  edge: { on: (s) => s.schema.format === "uri", where: "a format: uri schema", faults: one("an edge label", (v) => typeof v === "string") },
  unique: { on: (s) => isField(s) && s.required, where: "a required field", faults: one(true, (v) => v === true) },
  key: { on: (s, kind) => isField(s) && s.required && kind === "event", where: "a required field of an event type", faults: one(true, (v) => v === true) },
  card_order: { on: isField, where: "a field", faults: one("an integer", (v) => typeof v === "number" && Number.isSafeInteger(v)) },
};

/** KR-19: whether a key of a schema is an annotation. */
export const isAnnotation = (key: string): boolean => Object.hasOwn(ANNOTATIONS, key);

const PLACES = { root: "the root", items: "the items", values: "the values", branch: "a branch of oneOf" } as const;

/** Where a schema sits, as a refusal names it: `an optional field of an entity type, format: uri`. */
function placeOf(site: Site, kind: Kind): string {
  const where = site.site === "field" ? `${site.required ? "a required" : "an optional"} field` : PLACES[site.site];
  const format = typeof site.schema.format === "string" ? `, format: ${site.schema.format}` : "";
  return `${where} of an ${kind} type${format}`;
}

/** KR-19: the annotation `key` of a schema, refused where it does not sit and where its form is broken. */
export function annotationRejections(site: Site, key: string, context: Context): Rejection[] {
  const annotation = isAnnotation(key) ? ANNOTATIONS[key] : undefined;
  if (annotation === undefined) throw new Error(`bug: ${key} is not an annotation of KR-19`);
  const path = pointer(site.path, key);
  const { intent } = context;
  if (!annotation.on(site, context.kind)) return [reject(KR_19, { intent, path, expected: annotation.where, got: placeOf(site, context.kind) })];
  return annotation
    .faults(site.schema[key] ?? null)
    .map((f) => reject(KR_19, { intent, path: f.key === null ? path : pointer(path, f.key), expected: f.expected, got: f.got }));
}
