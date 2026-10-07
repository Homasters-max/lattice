// The values of one schema of the subset against another, keyword by keyword
// (KR-22): whether every value A admits is shown to be admitted by B, here,
// at this schema — the schemas it holds, items, values and fields, are
// compared by the walk of compare.ts. A finite set of values — `enum`,
// `const`, or only `boolean` and `null` — is checked value by value with
// `validate`; any other set is compared structurally, one JSON type at a time,
// and whatever cannot be shown that way is not shown: incomparable is the safe
// side (R2).
import { isJsonArray, type JsonValue } from "./json.js";
import type { Schema } from "./schema.js";
import { validate, type Resolve } from "./validate.js";

/** The JSON types a schema names, its `null` among them; none for a schema of `enum` or `const` alone. */
export function typesOf(s: Schema): readonly string[] {
  const types = isJsonArray(s.type) ? s.type : [s.type];
  return types.filter((t): t is string => typeof t === "string");
}

const FINITE: { readonly [type: string]: readonly JsonValue[] } = { null: [null], boolean: [true, false] };

/** The values of a schema when it admits a finite set the kernel can list, or `null`. */
function finiteValues(s: Schema, resolve: Resolve): readonly JsonValue[] | null {
  const listed = isJsonArray(s.enum) ? s.enum : s.const !== undefined ? [s.const] : null;
  const types = typesOf(s);
  const candidates = listed ?? (types.every((t) => Object.hasOwn(FINITE, t)) ? types.flatMap((t) => FINITE[t] ?? []) : null);
  return candidates?.filter((v) => validate(v, s, resolve).ok) ?? null;
}

const number = (s: Schema, keyword: string, otherwise: number): number => {
  const v = s[keyword];
  return typeof v === "number" ? v : otherwise;
};

/** `[lo, hi]` of a schema between two keywords; an integer range is tightened to the integers in it. */
function range(s: Schema, low: string, high: string, integer: boolean): readonly [number, number] {
  const [lo, hi] = [number(s, low, -Infinity), number(s, high, Infinity)];
  return integer ? [Math.ceil(lo), Math.floor(hi)] : [lo, hi];
}

/** Whether a range of A lies inside the range of B. */
function inside(a: Schema, b: Schema, [low, high]: readonly [string, string], integer = false): boolean {
  const [alo, ahi] = range(a, low, high, integer);
  const [blo, bhi] = range(b, low, high, false);
  return alo >= blo && ahi <= bhi;
}

type Part = { readonly within: readonly string[]; readonly fits: (a: Schema, b: Schema) => boolean };

/** One JSON type of A, none of its values listed: the types of B that hold it, and what its keywords need of B's. */
const PARTS: { readonly [type: string]: Part } = {
  null: { within: ["null"], fits: () => true },
  boolean: { within: ["boolean"], fits: () => true },
  string: { within: ["string"], fits: (a, b) => inside(a, b, ["minLength", "maxLength"]) && (b.format === undefined || b.format === a.format) },
  integer: { within: ["integer", "number"], fits: (a, b) => inside(a, b, ["minimum", "maximum"], true) },
  number: { within: ["number"], fits: (a, b) => inside(a, b, ["minimum", "maximum"]) },
  array: { within: ["array"], fits: (a, b) => inside(a, b, ["minItems", "maxItems"]) },
  object: { within: ["object"], fits: (a, b) => (a.values === undefined) === (b.values === undefined) },
};

/** Whether the values of one JSON type of A — none of them listed — are values of B, inner schemas aside. */
function typeWithin(type: string, a: Schema, b: Schema): boolean {
  const part = Object.hasOwn(PARTS, type) ? PARTS[type] : undefined;
  return part !== undefined && part.within.some((t) => typesOf(b).includes(t)) && part.fits(a, b);
}

/**
 * KR-22: whether every value A admits is shown to be admitted by B at this schema, its inner schemas aside. A finite
 * A is checked value by value; against a finite B, an A the kernel cannot list is not shown.
 */
export function valuesWithin(a: Schema, b: Schema, resolve: Resolve): boolean {
  const listed = finiteValues(a, resolve);
  if (listed !== null) return listed.every((v) => validate(v, b, resolve).ok);
  if (finiteValues(b, resolve) !== null) return false;
  return typesOf(a).every((t) => typeWithin(t, a, b));
}

/** Whether a schema admits only scalars the kernel lists, so it holds no inner schema to compare (KR-18: `enum` and `const` apply to scalars). */
export const isListed = (s: Schema, resolve: Resolve): boolean => finiteValues(s, resolve) !== null;
