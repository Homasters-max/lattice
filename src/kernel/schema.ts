// The schema subset (KR-18). A schema of a type holds only the keywords of
// KR-18, each only where it applies and in its form, and the annotations of
// KR-19; anything else is refused, never ignored — a new keyword is a new
// kernel version. Objects are always closed: a schema that would admit any
// value — no `type`, `$ref`, `oneOf`, `enum` or `const` — is refused too. The
// forms the rule leaves open are G-22. The check walks with its own stack, so
// no depth of nesting overflows. Whether `$ref` names an abstract type needs
// the type of its target: the Type check asks it (S0-07).
import { annotationRejections, isAnnotation, type Context, type Site } from "./annotations.js";
import type { Kind } from "./id.js";
import { isJsonArray, isJsonObject, own, pointer, serialize, type JsonObject, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { reject, sortRejections, type Place, type Rejection } from "./rejection.js";
import { KR_18 } from "./rules.js";

/** KR-18: a schema of the closed subset — a value `checkSchema` admits. */
export type Schema = JsonObject;

const TYPES: readonly JsonValue[] = ["string", "integer", "number", "boolean", "object", "array", "null"];
const SCALARS: readonly string[] = ["string", "integer", "number", "boolean"];
const FORMATS: readonly JsonValue[] = ["date-time", "date", "decimal", "ulid", "ref", "uri"];

/** KR-23: a field name, so that a fragment can address it (G-22). */
const FIELD = /^[a-z][a-z0-9_]*$/;

/** The types a keyword applies to: any schema, a scalar or no type at all, or those listed (the pair's `null` aside). */
type Applies = "any" | "scalar" | readonly string[];

type Keyword = { readonly applies: Applies; readonly expected: JsonValue; readonly fits: (v: JsonValue) => boolean };

const isType = (v: JsonValue): boolean => TYPES.includes(v);
const isTypePair = (v: JsonValue): boolean => isJsonArray(v) && v.length === 2 && v.every(isType) && v[0] !== v[1] && v.includes("null");
const isCount = (v: JsonValue): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isScalar = (v: JsonValue): boolean => v === null || typeof v !== "object";
const isEnum = (v: JsonValue): boolean => isJsonArray(v) && v.length > 0 && v.every(isScalar) && new Set(v).size === v.length;
const isField = (v: JsonValue): boolean => typeof v === "string" && FIELD.test(v);

const COUNT: Keyword = { applies: ["array"], expected: "an integer from 0", fits: isCount };
const LENGTH: Keyword = { ...COUNT, applies: ["string"] };
const BOUND: Keyword = { applies: ["integer", "number"], expected: "a number", fits: (v) => typeof v === "number" };
/** `items` and `values` hold a schema: the walk checks it as one. */
const SUBSCHEMA = { expected: "a schema", fits: () => true } as const;

/** KR-18: the keywords of the subset, where each applies and its form. */
const KEYWORDS: { readonly [keyword: string]: Keyword } = {
  type: { applies: "any", expected: "a type of KR-18, or a pair of one with null", fits: (v) => isType(v) || isTypePair(v) },
  properties: { applies: ["object"], expected: "an object of field schemas", fits: isJsonObject },
  required: { applies: ["object"], expected: "an array of field names", fits: (v) => isJsonArray(v) && v.every((s) => typeof s === "string") },
  values: { applies: ["object"], ...SUBSCHEMA },
  items: { applies: ["array"], ...SUBSCHEMA },
  minItems: COUNT,
  maxItems: COUNT,
  minLength: LENGTH,
  maxLength: LENGTH,
  format: { applies: ["string"], expected: FORMATS, fits: (v) => FORMATS.includes(v) },
  minimum: BOUND,
  maximum: BOUND,
  enum: { applies: "scalar", expected: "a non-empty array of distinct scalars", fits: isEnum },
  const: { applies: "scalar", expected: "a scalar", fits: isScalar },
  oneOf: { applies: "any", expected: "a non-empty array of branches", fits: (v) => isJsonArray(v) && v.length > 0 },
  discriminator: { applies: "any", expected: "the name of a field", fits: isField },
  $ref: { applies: "any", expected: "a pinned reference type@n", fits: (v) => typeof v === "string" && isPinned(v) },
  description: { applies: "any", expected: "a string", fits: (v) => typeof v === "string" },
};

const isKeyword = (key: string): boolean => Object.hasOwn(KEYWORDS, key);

/** The types a schema names, or `null` when `type` is broken — its own refusal says so. */
function typesOf(schema: Schema): readonly JsonValue[] | null {
  const { type } = schema;
  if (type === undefined) return [];
  if (isType(type)) return [type];
  return isTypePair(type) && isJsonArray(type) ? type : null;
}

function applies(applied: Applies, types: readonly JsonValue[]): boolean {
  if (applied === "any") return true;
  const real = types.filter((t) => t !== "null");
  if (applied === "scalar") return real.every((t) => typeof t === "string" && SCALARS.includes(t));
  return real.length > 0 && real.every((t) => typeof t === "string" && applied.includes(t));
}

/** KR-18: a keyword where it applies — the type of its schema — and in its form. */
function keywordRejections(schema: Schema, key: string, path: string, intent: string | null): Rejection[] {
  const keyword = KEYWORDS[key];
  if (keyword === undefined) throw new Error(`bug: ${key} is not a keyword of KR-18`);
  const types = typesOf(schema);
  const at = pointer(path, key);
  if (types !== null && !applies(keyword.applies, types)) {
    const expected = keyword.applies === "scalar" ? "a scalar type, or no type" : keyword.applies;
    return [reject(KR_18, { intent, path: at, expected, got: schema.type ?? "absent" })];
  }
  const value = schema[key] ?? null;
  return keyword.fits(value) ? [] : [reject(KR_18, { intent, path: at, expected: keyword.expected, got: value })];
}

/** KR-18, KR-19: each key of a schema — a keyword, an annotation, or neither and refused. */
function keyRejections(site: Site, key: string, context: Context): Rejection[] {
  if (isKeyword(key)) return keywordRejections(site.schema, key, site.path, context.intent);
  if (isAnnotation(key)) return annotationRejections(site, key, context);
  return [reject(KR_18, { intent: context.intent, path: pointer(site.path, key), expected: "a keyword of KR-18 or an annotation of KR-19", got: key })];
}

/** What a schema may hold beside `$ref` or `oneOf`, annotations aside (G-22). */
const BESIDE: { readonly [head: string]: readonly string[] } = { $ref: ["$ref", "description"], oneOf: ["oneOf", "discriminator", "description"] };

/** G-22: `$ref` stands alone, `oneOf` with its discriminator; a description and annotations may sit beside either. */
function besideRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const head = ["$ref", "oneOf"].find((k) => schema[k] !== undefined);
  const allowed = head === undefined ? undefined : BESIDE[head];
  if (allowed === undefined) return [];
  return Object.keys(schema)
    .filter((k) => isKeyword(k) && !allowed.includes(k))
    .map((k) => reject(KR_18, { intent, path: pointer(path, k), expected: `absent beside ${head ?? ""}`, got: schema[k] ?? null }));
}

/** KR-18: objects are always closed — a schema names a type, a reference, a union or its values (G-22). */
function shapeRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const shaped = ["type", "$ref", "oneOf", "enum", "const"].some((k) => schema[k] !== undefined);
  const discriminator = (expected: string, got: JsonValue) => [reject(KR_18, { intent, path: pointer(path, "discriminator"), expected, got })];
  return [
    ...(shaped ? [] : [reject(KR_18, { intent, path, expected: "a schema with type, $ref, oneOf, enum or const", got: "absent" })]),
    ...(schema.oneOf !== undefined && schema.discriminator === undefined ? discriminator("the name of a field", "absent") : []),
    ...(schema.oneOf === undefined && schema.discriminator !== undefined ? discriminator("absent without oneOf", schema.discriminator) : []),
    ...besideRejections(schema, path, intent),
  ];
}

/** G-22: a field is named `[a-z][a-z0-9_]*`; `required` names each field of `properties` once; a record of fields is no map. */
function objectRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const required = isJsonArray(schema.required) ? schema.required : [];
  const names = Object.keys(properties)
    .filter((name) => !FIELD.test(name))
    .map((name) => reject(KR_18, { intent, path: pointer(pointer(path, "properties"), name), expected: "a field name [a-z][a-z0-9_]*", got: name }));
  const listed = required.flatMap((name, i) => {
    const known = typeof name === "string" && Object.hasOwn(properties, name);
    const expected = !known ? "a field of properties" : required.indexOf(name) < i ? "a field named once" : null;
    return expected === null ? [] : [reject(KR_18, { intent, path: pointer(pointer(path, "required"), i), expected, got: name })];
  });
  const both = schema.properties !== undefined && schema.values !== undefined;
  return [...names, ...listed, ...(both ? [reject(KR_18, { intent, path: pointer(path, "values"), expected: "absent beside properties", got: schema.values ?? null })] : [])];
}

/** KR-18: one branch of a tagged union — an object whose discriminator field is required and holds a `const`. */
function branchRejections(branch: Schema, discriminator: string, path: string, intent: string | null): Rejection[] {
  if (branch.type !== "object") return [reject(KR_18, { intent, path: pointer(path, "type"), expected: "object", got: branch.type ?? "absent" })];
  const tag = isJsonObject(branch.properties) ? own(branch.properties, discriminator) : undefined;
  const required = isJsonArray(branch.required) && branch.required.includes(discriminator);
  return [
    ...(isJsonObject(tag) && tag.const !== undefined
      ? []
      : [reject(KR_18, { intent, path: pointer(pointer(path, "properties"), discriminator), expected: "a field with const", got: tag ?? "absent" })]),
    ...(required ? [] : [reject(KR_18, { intent, path: pointer(path, "required"), expected: `fields that name ${discriminator}`, got: branch.required ?? "absent" })]),
  ];
}

/** The `const` of the discriminator field of a branch; `undefined` when it has none. */
function constOf(branch: JsonValue, discriminator: string): JsonValue | undefined {
  const tag = isJsonObject(branch) && isJsonObject(branch.properties) ? own(branch.properties, discriminator) : undefined;
  return isJsonObject(tag) ? tag.const : undefined;
}

/** KR-18: `oneOf` with `discriminator` is a tagged union — each branch an object whose discriminator is a distinct `const`. */
function unionRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const { oneOf, discriminator } = schema;
  if (!isJsonArray(oneOf) || typeof discriminator !== "string" || !FIELD.test(discriminator)) return [];
  const tags = oneOf.map((b) => {
    const tag = constOf(b, discriminator);
    return tag === undefined ? null : serialize(tag);
  });
  return oneOf.flatMap((branch, i) => {
    if (!isJsonObject(branch)) return [];
    const at = pointer(pointer(path, "oneOf"), i);
    const tag = tags[i] ?? null;
    const repeated = tag !== null && tags.indexOf(tag) < i;
    const constPath = pointer(pointer(pointer(at, "properties"), discriminator), "const");
    const repeat = reject(KR_18, { intent, path: constPath, expected: "a const no other branch holds", got: constOf(branch, discriminator) ?? null });
    return [...branchRejections(branch, discriminator, at, intent), ...(repeated ? [repeat] : [])];
  });
}

/** A schema as the walk meets it, before it is known to be an object. */
type Node = Omit<Site, "schema"> & { readonly schema: JsonValue };

/** The schemas a schema holds: its fields, items, map values and branches. */
function childrenOf(site: Site): Node[] {
  const { schema, path } = site;
  const required = isJsonArray(schema.required) ? schema.required : [];
  const at = (key: string, inner: string | number) => pointer(pointer(path, key), inner);
  const fields = isJsonObject(schema.properties)
    ? Object.entries(schema.properties).map(([name, s]): Node => ({ schema: s, path: at("properties", name), site: "field", required: required.includes(name) }))
    : [];
  const inner = (["items", "values"] as const).flatMap((key): Node[] => {
    const s = schema[key];
    return s === undefined ? [] : [{ schema: s, path: pointer(path, key), site: key, required: false }];
  });
  const branches = isJsonArray(schema.oneOf) ? schema.oneOf.map((s, i): Node => ({ schema: s, path: at("oneOf", i), site: "branch", required: false })) : [];
  return [...fields, ...inner, ...branches];
}

/** KR-18, KR-19: every key of one schema and its shape. */
function siteRejections(site: Site, context: Context): Rejection[] {
  const { schema, path } = site;
  return [
    ...Object.keys(schema).flatMap((key) => keyRejections(site, key, context)),
    ...shapeRejections(schema, path, context.intent),
    ...objectRejections(schema, path, context.intent),
    ...unionRejections(schema, path, context.intent),
  ];
}

/**
 * KR-18, KR-19: the schema of a type of this kind, refused keyword by keyword at the place the caller names — where
 * the schema sits in its input; the rejections come sorted (CONVENTIONS.md §5).
 */
export function checkSchema(schema: JsonValue, kind: Kind, place: Place): Rejection[] {
  const context: Context = { kind, intent: place.intent };
  const out: Rejection[] = [];
  const pending: Node[] = [{ schema, path: place.path, site: "root", required: false }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const { schema: s } = node;
    if (!isJsonObject(s)) {
      out.push(reject(KR_18, { intent: place.intent, path: node.path, expected: "a schema object", got: s }));
      continue;
    }
    const site: Site = { ...node, schema: s };
    for (const r of siteRejections(site, context)) out.push(r);
    for (const child of childrenOf(site)) pending.push(child);
  }
  return sortRejections(out);
}
