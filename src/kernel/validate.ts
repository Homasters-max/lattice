// validate (KR-21): a value against a schema of the subset (KR-18) returns ok
// or its violations {path, keyword, expected, got}, sorted (CONVENTIONS.md
// §5). `$ref` is resolved only through the caller's function; the kernel never
// reads a store. Formats are read by the kernel's own predicates — KR-11
// `isFormat`, KR-23 `parseRef`, KR-24 `isUri` — and a broken one is a
// violation of the schema, not a refusal of those rules. Annotations are not
// checked here: `ref.pin` and `label` are phase 4's (S0-15). A string is
// measured in code points (G-22). The walk keeps its own stack, so no depth of
// nesting overflows; a `$ref` that comes back to itself before the value
// descends is a violation, not a loop.
import { isFormat } from "./formats.js";
import { compareText, gotOf, isJsonArray, isJsonObject, own, pointer, serialize, type JsonObject, type JsonValue } from "./json.js";
import { parseRef } from "./ref.js";
import { reject, type Place, type Rejection } from "./rejection.js";
import { KR_21 } from "./rules.js";
import type { Schema } from "./schema.js";
import { isUri } from "./uri.js";

/** KR-21: what a value breaks — the JSON Pointer to it (G-13), the keyword, what the keyword wants and what came. */
export type Violation = { readonly path: string; readonly keyword: string; readonly expected: JsonValue; readonly got: JsonValue };

export type Violations = readonly [Violation, ...Violation[]];

/** KR-21: the schema the caller knows for a pinned reference `$ref`, or `null`. */
export type Resolve = (ref: string) => Schema | null;

/** One value against one schema; `refs` — the `$ref` followed to it since the value last descended. */
type Task = { readonly value: JsonValue; readonly schema: Schema; readonly path: string; readonly refs: readonly string[] };

type Visit = { readonly violations: readonly Violation[]; readonly next: readonly Task[] };

const violation = (path: string, keyword: string, expected: JsonValue, got: JsonValue): Violation => ({ path, keyword, expected, got });

const only = (v: Violation): Visit => ({ violations: [v], next: [] });

/** A schema inside a schema `checkSchema` admitted; anything else is a program error, not a violation of the value. */
function schemaAt(value: JsonValue | undefined, where: string): Schema {
  if (!isJsonObject(value)) throw new Error(`bug: validate takes a schema checkSchema admits; ${where} is no schema`);
  return value;
}

const FORMATS: { readonly [format: string]: (s: string) => boolean } = {
  "date-time": (s) => isFormat("date-time", s),
  date: (s) => isFormat("date", s),
  decimal: (s) => isFormat("decimal", s),
  ulid: (s) => isFormat("ulid", s),
  ref: (s) => parseRef(s).ok,
  uri: isUri,
};

const TYPES: { readonly [type: string]: (v: JsonValue) => boolean } = {
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: isJsonObject,
  array: (v) => isJsonArray(v),
  null: (v) => v === null,
};

/** KR-18: a value of the type or of either type of the pair. */
function fitsType(type: JsonValue, value: JsonValue): boolean {
  const types = isJsonArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && Object.hasOwn(TYPES, t) && TYPES[t]?.(value) === true);
}

const number = (schema: Schema, keyword: string): number | undefined => {
  const v = schema[keyword];
  return typeof v === "number" ? v : undefined;
};

/** A bound a value must not fall under (`min`) or go over. */
function bound(path: string, keyword: string, limit: number | undefined, measure: number): Violation[] {
  if (limit === undefined) return [];
  const broken = keyword.startsWith("min") ? measure < limit : measure > limit;
  return broken ? [violation(path, keyword, limit, measure)] : [];
}

/** `minLength`, `maxLength` in code points, and `format`. */
function stringViolations(s: string, schema: Schema, path: string): Violation[] {
  const length = [...s].length;
  const { format } = schema;
  const check = typeof format === "string" ? FORMATS[format] : undefined;
  return [
    ...bound(path, "minLength", number(schema, "minLength"), length),
    ...bound(path, "maxLength", number(schema, "maxLength"), length),
    ...(check === undefined || check(s) ? [] : [violation(path, "format", format ?? null, s)]),
  ];
}

/** `enum`, `const`, and the keywords of a string and a number. */
function scalarViolations(value: JsonValue, schema: Schema, path: string): Violation[] {
  const { enum: listed, const: fixed } = schema;
  return [
    ...(isJsonArray(listed) && !listed.includes(value) ? [violation(path, "enum", listed, value)] : []),
    ...(fixed !== undefined && fixed !== value ? [violation(path, "const", fixed, value)] : []),
    ...(typeof value === "string" ? stringViolations(value, schema, path) : []),
    ...(typeof value === "number" ? [...bound(path, "minimum", number(schema, "minimum"), value), ...bound(path, "maximum", number(schema, "maximum"), value)] : []),
  ];
}

/** `minItems`, `maxItems` (KR-20) and every item against `items`. */
function visitArray(items: readonly JsonValue[], schema: Schema, path: string): Visit {
  const inner = schema.items === undefined ? undefined : schemaAt(schema.items, "items");
  return {
    violations: [...bound(path, "minItems", number(schema, "minItems"), items.length), ...bound(path, "maxItems", number(schema, "maxItems"), items.length)],
    next: inner === undefined ? [] : items.map((value, i) => ({ value, schema: inner, path: pointer(path, i), refs: [] })),
  };
}

/** KR-18: a map key, as KR-23 reads it in a fragment. */
const MAP_KEY = /^[a-z0-9][a-z0-9._@-]*$/;

/** A map: every key in the grammar of KR-18, every value against `values`. */
function visitMap(object: JsonObject, values: Schema, path: string): Visit {
  const entries = Object.entries(object);
  return {
    violations: entries.filter(([k]) => !MAP_KEY.test(k)).map(([k]) => violation(pointer(path, k), "values", "a key [a-z0-9][a-z0-9._@-]*", k)),
    next: entries.map(([k, value]) => ({ value, schema: values, path: pointer(path, k), refs: [] })),
  };
}

/** A closed object: no key outside `properties`, every `required` field present, each field against its schema. */
function visitObject(object: JsonObject, schema: Schema, path: string): Visit {
  if (schema.values !== undefined) return visitMap(object, schemaAt(schema.values, "values"), path);
  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const required = isJsonArray(schema.required) ? schema.required : [];
  const entries = Object.entries(object);
  const listed = entries.filter(([k]) => Object.hasOwn(properties, k));
  return {
    violations: [
      ...entries.filter(([k]) => !Object.hasOwn(properties, k)).map(([k, v]) => violation(pointer(path, k), "properties", "absent", v)),
      ...required.flatMap((k) => (typeof k === "string" && !Object.hasOwn(object, k) ? [violation(pointer(path, k), "required", "present", "absent")] : [])),
    ],
    next: listed.map(([k, value]) => ({ value, schema: schemaAt(properties[k], k), path: pointer(path, k), refs: [] })),
  };
}

/** `type` first: a value of another type meets no other keyword. */
function visitTyped(task: Task): Visit {
  const { value, schema, path } = task;
  if (schema.type !== undefined && !fitsType(schema.type, value)) return only(violation(path, "type", schema.type, value));
  const container = schema.type === undefined ? null : isJsonArray(value) ? visitArray(value, schema, path) : isJsonObject(value) ? visitObject(value, schema, path) : null;
  return { violations: [...scalarViolations(value, schema, path), ...(container?.violations ?? [])], next: container?.next ?? [] };
}

/** `oneOf` with `discriminator`: the branch whose discriminator `const` the value holds. */
function visitUnion(task: Task, branches: readonly JsonValue[]): Visit {
  const { value, schema, path } = task;
  const discriminator = typeof schema.discriminator === "string" ? schema.discriminator : "";
  if (!isJsonObject(value)) return only(violation(path, "oneOf", "an object", value));
  const tags = branches.map((b) => schemaAt(own(schemaAt(schemaAt(b, "a branch").properties, "properties"), discriminator), discriminator).const ?? null);
  const tag = own(value, discriminator);
  const chosen = tag === undefined ? undefined : branches[tags.indexOf(tag)];
  if (chosen === undefined) return only(violation(pointer(path, discriminator), "discriminator", tags, gotOf(tag)));
  return { violations: [], next: [{ ...task, schema: schemaAt(chosen, "a branch") }] };
}

/** `$ref`: the schema the caller resolves, unless it is unknown or the reference came back to itself. */
function visitRef(task: Task, ref: string, resolve: Resolve): Visit {
  if (task.refs.includes(ref)) return only(violation(task.path, "$ref", "a schema, not a cycle of $ref", ref));
  const target = resolve(ref);
  if (target === null) return only(violation(task.path, "$ref", "a schema resolve knows", ref));
  return { violations: [], next: [{ ...task, schema: target, refs: [...task.refs, ref] }] };
}

function visit(task: Task, resolve: Resolve): Visit {
  const { $ref: ref, oneOf } = task.schema;
  if (typeof ref === "string") return visitRef(task, ref, resolve);
  if (isJsonArray(oneOf)) return visitUnion(task, oneOf);
  return visitTyped(task);
}

const keyOf = (v: Violation): readonly string[] => [v.path, v.keyword, serialize(v.expected), serialize(v.got)];

/** CONVENTIONS.md §5: by path, keyword, then canonical expected and got. */
function compare(a: Violation, b: Violation): number {
  const [ka, kb] = [keyOf(a), keyOf(b)];
  const first = ka.findIndex((x, i) => x !== kb[i]);
  return first < 0 ? 0 : compareText(ka[first] ?? "", kb[first] ?? "");
}

/**
 * KR-21: a value against a schema `checkSchema` admits — ok, or its violations, sorted. Nothing is read but the value,
 * the schema and what `resolve` returns.
 */
export function validate(value: JsonValue, schema: Schema, resolve: Resolve): { readonly ok: true } | { readonly ok: false; readonly violations: Violations } {
  const out: Violation[] = [];
  const pending: Task[] = [{ value, schema, path: "", refs: [] }];
  for (let task = pending.pop(); task !== undefined; task = pending.pop()) {
    const { violations, next } = visit(task, resolve);
    for (const v of violations) out.push(v);
    for (const t of next) pending.push(t);
  }
  const [first, ...rest] = out.sort(compare);
  return first === undefined ? { ok: true } : { ok: false, violations: [first, ...rest] };
}

/**
 * KR-21: the body of a record against the schema of its type — each violation refused with KR-21 at `place.path`
 * and its path, the keyword and what it wants as `expected`: `{"maxLength": 200}`. Phase 2 of apply calls it with
 * the intent and `/body` (S0-13).
 */
export function checkBody(body: JsonValue, schema: Schema, resolve: Resolve, place: Place): Rejection[] {
  const out = validate(body, schema, resolve);
  if (out.ok) return [];
  return out.violations.map((v) => reject(KR_21, { intent: place.intent, path: `${place.path}${v.path}`, expected: { [v.keyword]: v.expected }, got: v.got }));
}
