// Reading a schema of the subset (KR-18): its JSON types, its fields and
// `required`, the bounds it names, the schemas it holds and the branches of a
// tagged union by the `const` of their discriminator. One reading for every
// reader — `checkSchema`, `validate`, `compare` and the Type check — so that
// what a schema means is written once. A member out of its form reads as
// absent: `checkSchema` refuses it, and every other reader takes only a schema
// `checkSchema` admits.
import type { Site } from "./annotations.js";
import { isJsonArray, isJsonObject, own, pointer, serialize, type JsonObject, type JsonValue } from "./json.js";

/** A schema object as read here, admitted or not — `Schema` of schema.ts is the one `checkSchema` admits. */
type SchemaObject = JsonObject;

/** KR-18: the JSON types of the subset, each with the values it holds. */
const TYPES: { readonly [type: string]: (v: JsonValue) => boolean } = {
  string: (v) => typeof v === "string",
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: isJsonObject,
  array: (v) => isJsonArray(v),
  null: (v) => v === null,
};

/** KR-18: whether a value names one of the JSON types of the subset. */
export const isJsonType = (v: JsonValue): v is string => typeof v === "string" && Object.hasOwn(TYPES, v);

/** KR-18: a pair of two different JSON types, one of them `null`, in either order (G-22). */
export const isTypePair = (v: JsonValue): v is readonly string[] => isJsonArray(v) && v.length === 2 && v.every(isJsonType) && v[0] !== v[1] && v.includes("null");

/** The JSON types a schema names, its `null` among them; none for a schema of `enum`, `const`, `$ref` or `oneOf` alone. */
export function typesOf(schema: SchemaObject): readonly string[] {
  const { type } = schema;
  if (type === undefined) return [];
  if (isJsonType(type)) return [type];
  return isTypePair(type) ? type : [];
}

/** KR-18: whether a value is of a type the schema names; a schema without `type` names none. */
export const fitsType = (schema: SchemaObject, value: JsonValue): boolean => typesOf(schema).some((t) => TYPES[t]?.(value) === true);

/** The fields of an object schema by name. */
export const propertiesOf = (schema: SchemaObject): JsonObject => (isJsonObject(schema.properties) ? schema.properties : {});

/** The names `required` lists, as written. */
export const requiredOf = (schema: SchemaObject): readonly JsonValue[] => (isJsonArray(schema.required) ? schema.required : []);

/** The number a keyword of the schema holds — a length, a count or a bound — or `undefined`. */
export function numberOf(schema: SchemaObject, keyword: string): number | undefined {
  const v = schema[keyword];
  return typeof v === "number" ? v : undefined;
}

/** KR-18: the `const` of the discriminator field of a branch of a tagged union; `undefined` when it has none. */
export function tagOf(branch: JsonValue, discriminator: string): JsonValue | undefined {
  const tag = isJsonObject(branch) ? own(propertiesOf(branch), discriminator) : undefined;
  return isJsonObject(tag) ? tag.const : undefined;
}

/** A branch of a tagged union, by the canonical text of its tag. */
export type Branch = { readonly key: string; readonly tag: JsonValue; readonly schema: SchemaObject };

/** KR-18: the branches of `oneOf` with `discriminator`, each with its tag; a branch without a tag is passed over. */
export function branchesOf(schema: SchemaObject): readonly Branch[] {
  const { oneOf, discriminator } = schema;
  if (!isJsonArray(oneOf) || typeof discriminator !== "string") return [];
  return oneOf.flatMap((branch) => {
    const tag = tagOf(branch, discriminator);
    return isJsonObject(branch) && tag !== undefined ? [{ key: serialize(tag), tag, schema: branch }] : [];
  });
}

/** A schema as a walk meets it, before it is known to be an object. */
export type Node = Omit<Site, "schema"> & { readonly schema: JsonValue };

/** The schemas a schema holds: its fields, items, map values and branches. */
export function childrenOf(site: Site): Node[] {
  const { schema, path } = site;
  const required = requiredOf(schema);
  const at = (key: string, inner: string | number) => pointer(pointer(path, key), inner);
  const fields = Object.entries(propertiesOf(schema)).map(([name, s]): Node => ({ schema: s, path: at("properties", name), site: "field", required: required.includes(name) }));
  const inner = (["items", "values"] as const).flatMap((key): Node[] => {
    const s = schema[key];
    return s === undefined ? [] : [{ schema: s, path: pointer(path, key), site: key, required: false }];
  });
  const branches = isJsonArray(schema.oneOf) ? schema.oneOf.map((s, i): Node => ({ schema: s, path: at("oneOf", i), site: "branch", required: false })) : [];
  return [...fields, ...inner, ...branches];
}

/** Every schema object a schema holds, the root among them, with where each sits; a member that is no object is passed over. */
export function sitesOf(schema: JsonValue, path: string): Site[] {
  const out: Site[] = [];
  const pending: Node[] = [{ schema, path, site: "root", required: false }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (!isJsonObject(node.schema)) continue;
    const site: Site = { ...node, schema: node.schema };
    out.push(site);
    for (const child of childrenOf(site)) pending.push(child);
  }
  return out;
}
