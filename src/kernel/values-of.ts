// The values of a body with the schemas they meet (KR-18, KR-19): the body is
// walked by the schema of its type as `validate` walks it — `$ref` followed
// through the caller's function, a tagged union by the `const` of its
// discriminator, items, map values and fields — so that the readers of
// annotations and formats read a schema one way: fold reads references,
// external links and unique values from it (LG-35, RF-09, LG-19). The walk is
// total: a value its schema does not admit is not descended into, never
// refused — refusing is validate's (KR-21) — and a type the kernel does not
// read gives no values. It keeps its own stack, so no depth overflows.
import { compareText, isJsonArray, isJsonObject, own, pointer, type JsonValue } from "./json.js";
import { branchesOf, fitsType, isAny, propertiesOf } from "./read-schema.js";
import type { Schema } from "./schema.js";
import { schemasOf, typeAt, type ResolveType } from "./type.js";

/** A value of a body, at its JSON Pointer, with one schema it meets there — a `$ref`, a union and its branch each count. */
export type ValueAt = { readonly path: string; readonly value: JsonValue; readonly schema: Schema };

/** One value against one schema; `refs` — the `$ref` followed to it since the value last descended. */
type Task = { readonly value: JsonValue; readonly schema: JsonValue | undefined; readonly path: string; readonly refs: readonly string[] };

/** The values a value of a container holds, each with the schema its container gives it. */
function inner(task: Task, schema: Schema): Task[] {
  const { value, path } = task;
  const at = (v: JsonValue, key: string | number, s: JsonValue | undefined): Task => ({ value: v, schema: s, path: pointer(path, key), refs: [] });
  if (isJsonArray(value)) return value.map((v, i) => at(v, i, schema.items));
  if (!isJsonObject(value)) return [];
  if (schema.values !== undefined) return Object.entries(value).map(([k, v]) => at(v, k, schema.values));
  const properties = propertiesOf(schema);
  return Object.entries(value).flatMap(([k, v]) => (Object.hasOwn(properties, k) ? [at(v, k, properties[k])] : []));
}

/** Where the walk goes from one schema: the target of `$ref`, the branch a union chooses, or what a container holds. */
function next(task: Task, schema: Schema, resolve: ResolveType): Task[] {
  const { $ref: ref, discriminator } = schema;
  if (typeof ref === "string") {
    const target = task.refs.includes(ref) ? null : schemasOf(resolve)(ref);
    return target === null ? [] : [{ ...task, schema: target, refs: [...task.refs, ref] }];
  }
  if (typeof discriminator === "string") {
    const tag = isJsonObject(task.value) ? own(task.value, discriminator) : undefined;
    const chosen = tag === undefined ? undefined : branchesOf(schema).find((b) => b.tag === tag);
    return chosen === undefined ? [] : [{ ...task, schema: chosen.schema }];
  }
  return isAny(schema) ? [] : inner(task, schema);
}

/** A schema that names its type admits only a value of that type; the others are met and checked by what they hold. */
const admits = (schema: Schema, value: JsonValue): boolean => schema.type === undefined || isAny(schema) || fitsType(schema, value);

/**
 * KR-18, KR-19: every value of `body` with each schema the type at `type` gives it, by path; none where the kernel
 * reads no type at `type` (Q-33). A value its schema does not admit is passed over, with all it holds.
 */
export function valuesOf(body: JsonValue, type: string, resolve: ResolveType): readonly ValueAt[] {
  const root = typeAt(type, resolve);
  if (typeof root === "string") return [];
  const out: ValueAt[] = [];
  const pending: Task[] = [{ value: body, schema: root.schema, path: "", refs: [] }];
  for (let task = pending.pop(); task !== undefined; task = pending.pop()) {
    const { schema } = task;
    if (!isJsonObject(schema) || !admits(schema, task.value)) continue;
    out.push({ path: task.path, value: task.value, schema });
    for (const t of next(task, schema, resolve)) pending.push(t);
  }
  // The walk order follows the members of the body; the order of output does not (CONVENTIONS.md §5.5).
  return out.sort((a, b) => compareText(a.path, b.path));
}
