// The schema subset (KR-18). A schema of a type holds only the keywords of
// KR-18, each only where it applies and in its form, and the annotations of
// KR-19; anything else is refused, never ignored — a new keyword is a new
// kernel version. Objects are always closed: a schema that would admit any
// value — no `type`, `$ref`, `oneOf`, `enum` or `const` — is refused too; any
// value is said by `type: any` alone (G-38). The forms the rule leaves open are
// G-22. The check walks with its own stack, so
// no depth of nesting overflows. Whether `$ref` names an abstract type needs
// the type of its target: the Type check asks it (S0-07). What a schema holds
// is read by read-schema.ts, as every other reader reads it.
import { annotationRejections, isAnnotation, type Site } from "./annotations.js";
import { FORMATS, isSchemaFormat } from "./formats.js";
import type { Kind } from "./id.js";
import { isJsonArray, isJsonObject, own, pointer, serialize, type JsonObject, type JsonValue } from "./json.js";
import { ANY, childrenOf, isAny, isJsonType, isTypePair, propertiesOf, requiredOf, tagOf, typesOf, type Node } from "./read-schema.js";
import { isPinned } from "./ref.js";
import { refuse, refused, reject, type Place, type Rejection, type Result } from "./rejection.js";
import { KR_18 } from "./rules.js";

/** KR-18: a schema of the closed subset — a value `checkSchema` admits. */
export type Schema = JsonObject;

const SCALARS: readonly string[] = ["string", "integer", "number", "boolean"];

/** KR-23: a field name, so that a fragment can address it (G-22). */
const FIELD = /^[a-z][a-z0-9_]*$/;

/** The types a keyword applies to: any schema, a scalar or no type at all, or those listed (the pair's `null` aside). */
type Applies = "any" | "scalar" | readonly string[];

type Keyword = { readonly applies: Applies; readonly expected: JsonValue; readonly fits: (v: JsonValue) => boolean };

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
  type: {
    applies: "any",
    expected: "string, integer, number, boolean, object, array or null, a pair of one with null, or any",
    fits: (v) => v === ANY || isJsonType(v) || isTypePair(v),
  },
  properties: { applies: ["object"], expected: "an object of field schemas", fits: isJsonObject },
  required: { applies: ["object"], expected: "an array of field names", fits: (v) => isJsonArray(v) && v.every((s) => typeof s === "string") },
  values: { applies: ["object"], ...SUBSCHEMA },
  items: { applies: ["array"], ...SUBSCHEMA },
  minItems: COUNT,
  maxItems: COUNT,
  minLength: LENGTH,
  maxLength: LENGTH,
  format: { applies: ["string"], expected: FORMATS, fits: isSchemaFormat },
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

function applies(applied: Applies, types: readonly string[]): boolean {
  if (applied === "any") return true;
  const real = types.filter((t) => t !== "null");
  if (applied === "scalar") return real.every((t) => SCALARS.includes(t));
  return real.length > 0 && real.every((t) => applied.includes(t));
}

/** KR-18: a keyword where it applies — the type of its schema — and in its form. */
function keywordRejections(schema: Schema, key: string, path: string, intent: string | null): Rejection[] {
  const keyword = KEYWORDS[key];
  if (keyword === undefined) throw new Error(`bug: ${key} is not a keyword of KR-18`);
  // A `type` out of its form is refused by its own key; no keyword is refused for where it sits beside it. Beside
  // `type: any` every keyword but a description is refused once, by besideRejections (G-38).
  const typed = schema.type === undefined || isJsonType(schema.type) || isTypePair(schema.type);
  const at = pointer(path, key);
  if (typed && !applies(keyword.applies, typesOf(schema))) {
    const expected = keyword.applies === "scalar" ? "a scalar type, or no type" : keyword.applies;
    return [reject(KR_18, { intent, path: at, expected, got: schema.type ?? "absent" })];
  }
  const value = schema[key] ?? null;
  return keyword.fits(value) ? [] : [reject(KR_18, { intent, path: at, expected: keyword.expected, got: value })];
}

/** KR-18, KR-19: each key of a schema — a keyword, an annotation, or neither and refused. */
function keyRejections(site: Site, key: string, kind: Kind, intent: string | null): Rejection[] {
  if (isKeyword(key)) return keywordRejections(site.schema, key, site.path, intent);
  if (isAnnotation(key)) return annotationRejections(site, key, kind, intent);
  return [reject(KR_18, { intent, path: pointer(site.path, key), expected: "a keyword or an annotation of the closed subset", got: key })];
}

/** What a schema may hold beside `$ref`, `oneOf` or `type: any`, annotations aside (G-22, G-38). */
const BESIDE: { readonly [head: string]: readonly string[] } = {
  $ref: ["$ref", "description"],
  oneOf: ["oneOf", "discriminator", "description"],
  "type any": ["type", "description"],
};

/** The keyword that leaves no room for others beside it: `$ref`, else `oneOf`, else `type: any`. */
function headOf(schema: Schema): string | undefined {
  const head = ["$ref", "oneOf"].find((k) => schema[k] !== undefined);
  return head ?? (isAny(schema) ? "type any" : undefined);
}

/**
 * G-22, G-38: `$ref` stands alone, `oneOf` with its discriminator, `type: any` alone — the kernel never looks into
 * its value; a description and annotations may sit beside each.
 */
function besideRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const head = headOf(schema);
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
  const properties = propertiesOf(schema);
  const required = requiredOf(schema);
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
  const field = own(propertiesOf(branch), discriminator);
  const required = requiredOf(branch).includes(discriminator);
  return [
    ...(tagOf(branch, discriminator) !== undefined
      ? []
      : [reject(KR_18, { intent, path: pointer(pointer(path, "properties"), discriminator), expected: "a field with const", got: field ?? "absent" })]),
    ...(required ? [] : [reject(KR_18, { intent, path: pointer(path, "required"), expected: `fields that name ${discriminator}`, got: branch.required ?? "absent" })]),
  ];
}

/** KR-18: `oneOf` with `discriminator` is a tagged union — each branch an object whose discriminator is a distinct `const`. */
function unionRejections(schema: Schema, path: string, intent: string | null): Rejection[] {
  const { oneOf, discriminator } = schema;
  if (!isJsonArray(oneOf) || typeof discriminator !== "string" || !FIELD.test(discriminator)) return [];
  const tags = oneOf.map((b) => {
    const tag = tagOf(b, discriminator);
    return tag === undefined ? null : serialize(tag);
  });
  return oneOf.flatMap((branch, i) => {
    if (!isJsonObject(branch)) return [];
    const at = pointer(pointer(path, "oneOf"), i);
    const tag = tags[i] ?? null;
    const repeated = tag !== null && tags.indexOf(tag) < i;
    const constPath = pointer(pointer(pointer(at, "properties"), discriminator), "const");
    const repeat = reject(KR_18, { intent, path: constPath, expected: "a const no other branch holds", got: tagOf(branch, discriminator) ?? null });
    return [...branchRejections(branch, discriminator, at, intent), ...(repeated ? [repeat] : [])];
  });
}

/** KR-18, KR-19: every key of one schema and its shape. */
function siteRejections(site: Site, kind: Kind, intent: string | null): Rejection[] {
  const { schema, path } = site;
  return [
    ...Object.keys(schema).flatMap((key) => keyRejections(site, key, kind, intent)),
    ...shapeRejections(schema, path, intent),
    ...objectRejections(schema, path, intent),
    ...unionRejections(schema, path, intent),
  ];
}

/**
 * KR-18, KR-19: the schema of a type of this kind, admitted, or its rejections keyword by keyword at the place the
 * caller names — where the schema sits in its input; the rejections come sorted (CONVENTIONS.md §5.2).
 */
export function checkSchema(schema: JsonValue, kind: Kind, place: Place): Result<Schema> {
  if (!isJsonObject(schema)) return refuse(reject(KR_18, { ...place, expected: "a schema object", got: schema }));
  const out: Rejection[] = [];
  const pending: Node[] = [{ schema, path: place.path, site: "root", required: false }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const { schema: s } = node;
    if (!isJsonObject(s)) {
      out.push(reject(KR_18, { intent: place.intent, path: node.path, expected: "a schema object", got: s }));
      continue;
    }
    const site: Site = { ...node, schema: s };
    for (const r of siteRejections(site, kind, place.intent)) out.push(r);
    for (const child of childrenOf(site)) pending.push(child);
  }
  return refused<Schema>(out) ?? { ok: true, value: schema };
}
