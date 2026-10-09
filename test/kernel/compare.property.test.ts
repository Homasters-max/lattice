// Soundness of compare (KR-22, R2), by fast-check: when compare finds A
// `narrower` or `same`, every value valid under A is valid under B — and when
// it finds A `wider` or `same`, every value valid under B is valid under A. In
// extends mode a value of A is first restricted to B's fields (KR-15).
// `incomparable` is always allowed: it is the safe side. The schemas come from
// a small grammar over a few values — `$ref` to a few abstract shapes and
// tagged unions among them — so that pairs often relate; a sample shows they
// do.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkSchema, compare, isJsonObject, ROOT, validate, type JsonValue, type Schema } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

/** The abstract shapes a `$ref` of the grammar names: a few that relate. */
const SHAPES: { readonly [ref: string]: Schema } = {
  "demo/small@1": { type: "object", properties: { n: { type: "integer", maximum: 1 } }, required: ["n"] },
  "demo/small@2": { type: "object", properties: { n: { type: "integer", maximum: 1 } }, required: ["n"] },
  "demo/large@1": { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
  "demo/open@1": { type: "object", properties: { n: { type: "number" } } },
};

const shapeOf = (ref: string): Schema | null => (Object.hasOwn(SHAPES, ref) ? (SHAPES[ref] ?? null) : null);

/** The type bodies compare resolves: each shape as an abstract type. */
const TYPES = (ref: string): JsonValue | null => {
  const shape = shapeOf(ref);
  return shape === null ? null : { abstract: true, kind: "entity", schema: shape };
};

const optional = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });

/** Drops the members a generator left undefined: JSON has no undefined. */
const json = (o: { readonly [key: string]: JsonValue | undefined }): Schema =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, JsonValue] => e[1] !== undefined));

const STRINGS = ["", "a", "ab", "abc", "2026-10-07", "01JB2X00000000000000000SES"] as const;
const SCALARS: readonly JsonValue[] = ["a", "ab", 0, 1, 2, true, null];
const count = fc.integer({ min: 0, max: 3 });
const bound = fc.constantFrom(-1, 0, 0.5, 1, 2);

const nullable = (s: fc.Arbitrary<Schema>): fc.Arbitrary<Schema> =>
  fc.tuple(s, fc.boolean()).map(([schema, pair]) => (pair && typeof schema.type === "string" ? { ...schema, type: [schema.type, "null"] } : schema));

const leaf: fc.Arbitrary<Schema> = fc.oneof(
  fc.record({ min: optional(count), max: optional(count), format: optional(fc.constantFrom("date", "ulid")) }).map((r) => json({ type: "string", minLength: r.min, maxLength: r.max, format: r.format })),
  fc.record({ type: fc.constantFrom("integer", "number"), min: optional(bound), max: optional(bound) }).map((r) => json({ type: r.type, minimum: r.min, maximum: r.max })),
  fc.constantFrom<Schema>({ type: "boolean" }, { type: "null" }, { type: "any" }),
  fc.uniqueArray(fc.constantFrom(...SCALARS), { minLength: 1, maxLength: 4 }).map((e): Schema => ({ enum: e })),
  fc.constantFrom(...SCALARS).map((c): Schema => ({ const: c })),
  fc.constantFrom(...Object.keys(SHAPES)).map((ref): Schema => ({ $ref: ref })),
);

const NAMES = ["a", "b", "c"] as const;

const { schema } = fc.letrec<{ schema: Schema; container: Schema }>((tie) => ({
  schema: fc.oneof({ depthSize: "small", withCrossShrink: true }, nullable(leaf), tie("container")),
  container: fc.oneof(
    fc.record({ items: optional(tie("schema")), min: optional(count), max: optional(count) }).map((r) => json({ type: "array", items: r.items, minItems: r.min, maxItems: r.max })),
    fc.record({ values: tie("schema") }).map((r): Schema => ({ type: "object", values: r.values })),
    fc
      .dictionary(fc.constantFrom(...NAMES), fc.tuple(tie("schema"), fc.boolean()), { maxKeys: 3 })
      .map((fields): Schema => ({
        type: "object",
        properties: Object.fromEntries(Object.entries(fields).map(([k, [s]]) => [k, s])),
        required: Object.entries(fields).flatMap(([k, [, req]]) => (req ? [k] : [])),
      })),
    fc
      .uniqueArray(fc.constantFrom("x", "y"), { minLength: 1, maxLength: 2 })
      .chain((tags) => fc.tuple(...tags.map((t) => fc.tuple(fc.constant(t), optional(tie("schema")), fc.boolean()))))
      .map(
        (branches): Schema => ({
          oneOf: branches.map(([t, n, required]) => ({
            type: "object",
            properties: n === undefined ? { kind: { const: t } } : { kind: { const: t }, n },
            required: required && n !== undefined ? ["kind", "n"] : ["kind"],
          })),
          discriminator: "kind",
        }),
      ),
  ),
}));

/** Values mostly valid under a schema, and some that are not. */
function valueOf(s: JsonValue): fc.Arbitrary<JsonValue> {
  if (!isJsonObject(s)) return fc.constant(null);
  if (Array.isArray(s.enum)) return fc.constantFrom(...(s.enum as JsonValue[]));
  if (s.const !== undefined) return fc.constant(s.const);
  if (typeof s.$ref === "string") return valueOf(shapeOf(s.$ref));
  if (Array.isArray(s.oneOf)) return fc.oneof(...(s.oneOf as JsonValue[]).map(valueOf));
  const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
  return fc.oneof(...types.map((t) => typed(s, t)), fc.constantFrom(...SCALARS));
}

const TYPED: { readonly [type: string]: (s: Schema) => fc.Arbitrary<JsonValue> } = {
  string: () => fc.constantFrom(...STRINGS),
  integer: () => fc.integer({ min: -2, max: 3 }),
  number: () => fc.constantFrom(-1.5, -1, 0, 0.5, 1, 2.5),
  boolean: () => fc.boolean(),
  any: () => fc.oneof(fc.constantFrom(...SCALARS), fc.constantFrom<JsonValue>([], [1, "a"], {}, { n: 1 }, { n: "a", Bad: [] })),
  array: (s) => fc.array(s.items === undefined ? fc.constantFrom(...SCALARS) : valueOf(s.items), { maxLength: 3 }),
  object: (s) =>
    s.values !== undefined
      ? fc.dictionary(fc.constantFrom("k", "x"), valueOf(s.values), { maxKeys: 2 })
      : objectOf(isJsonObject(s.properties) ? s.properties : {}, Array.isArray(s.required) ? (s.required as string[]) : []),
};

const typed = (s: Schema, type: string): fc.Arbitrary<JsonValue> => TYPED[type]?.(s) ?? fc.constant(null);

function objectOf(properties: { readonly [k: string]: JsonValue }, required: readonly string[]): fc.Arbitrary<JsonValue> {
  const fields = Object.fromEntries(Object.entries(properties).map(([k, s]) => [k, required.includes(k) ? valueOf(s) : optional(valueOf(s))]));
  return fc.tuple(fc.record(fields), optional(fc.constantFrom(...SCALARS))).map(([o, extra]) => json(extra === undefined ? o : { ...o, c: extra }));
}

/** The branch of a union a value takes, by its `kind`. */
function branchOf(value: JsonValue, branches: readonly JsonValue[]): JsonValue {
  const kind = isJsonObject(value) ? value.kind : undefined;
  return branches.find((b) => isJsonObject(b) && isJsonObject(b.properties) && isJsonObject(b.properties.kind) && b.properties.kind.const === kind) ?? null;
}

/** A value restricted to the fields of B, at every depth (KR-15). */
function restrict(value: JsonValue, b: JsonValue): JsonValue {
  if (!isJsonObject(b)) return value;
  if (typeof b.$ref === "string") return restrict(value, shapeOf(b.$ref));
  if (Array.isArray(b.oneOf)) return restrict(value, branchOf(value, b.oneOf as JsonValue[]));
  if (Array.isArray(value) && b.items !== undefined) return value.map((v: JsonValue) => restrict(v, b.items ?? null));
  if (!isJsonObject(value)) return value;
  if (b.values !== undefined) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restrict(v, b.values ?? null)]));
  const properties = isJsonObject(b.properties) ? b.properties : {};
  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (Object.hasOwn(properties, k) ? [[k, restrict(v, properties[k] ?? null)]] : [])));
}

const valid = (v: JsonValue, s: Schema) => validate(v, s, shapeOf).ok;

const BOUNDS: { readonly [type: string]: readonly [string, string] } = {
  string: ["minLength", "maxLength"],
  integer: ["minimum", "maximum"],
  number: ["minimum", "maximum"],
  array: ["minItems", "maxItems"],
};

/** A bound of a schema of one type moved, set or dropped. */
function rebound(s: Schema): fc.Arbitrary<Schema>[] {
  const keys = typeof s.type === "string" ? BOUNDS[s.type] : undefined;
  if (keys === undefined) return [];
  return [fc.tuple(fc.constantFrom(...keys), optional(s.type === "string" || s.type === "array" ? count : bound)).map(([k, v]) => json({ ...s, [k]: v }))];
}

const schemaOf = (v: JsonValue | undefined): Schema => (isJsonObject(v) ? v : {});

/** A field of an object made optional or required, dropped, added, or its schema moved. */
function refield(s: Schema, near: (s: Schema) => fc.Arbitrary<Schema>): fc.Arbitrary<Schema>[] {
  if (!isJsonObject(s.properties)) return [];
  const properties = s.properties;
  const required = (Array.isArray(s.required) ? s.required : []) as string[];
  const names = Object.keys(properties);
  const toggle = (k: string) => ({ ...s, required: required.includes(k) ? required.filter((r) => r !== k) : [...required, k] });
  const drop = (k: string) => ({ ...s, properties: Object.fromEntries(Object.entries(properties).filter(([n]) => n !== k)), required: required.filter((r) => r !== k) });
  const add = leaf.map((l): Schema => ({ ...s, properties: { ...properties, c: l } }));
  if (names.length === 0) return [add];
  const name = fc.constantFrom(...names);
  return [
    add,
    name.map(toggle),
    name.map(drop),
    name.chain((k) => near(schemaOf(properties[k])).map((f): Schema => ({ ...s, properties: { ...properties, [k]: f } }))),
  ];
}

/** A schema near another: one change — `items` dropped among them — so that a pair often relates. */
function near(s: Schema): fc.Arbitrary<Schema> {
  const inner = (["items", "values"] as const).flatMap((k) => {
    const v = s[k];
    return isJsonObject(v) ? [near(v).map((i): Schema => ({ ...s, [k]: i }))] : [];
  });
  const any = s.items === undefined ? [] : [fc.constant<Schema>(json({ ...s, items: undefined }))];
  const scalar = typeof s.type === "string" && s.type !== "object" && s.type !== "array";
  const pair = scalar || Array.isArray(s.type) ? [fc.constant<Schema>(json({ ...s, type: Array.isArray(s.type) ? (s.type[0] as JsonValue) : [s.type as string, "null"] }))] : [];
  return fc.oneof(fc.constant(s), nullable(leaf), ...pair, ...rebound(s), ...inner, ...any, ...refield(s, near));
}

/** Pairs of schemas the subset admits, each with values drawn from both sides. */
const pairs = fc
  .oneof(fc.tuple(schema, schema), schema.chain((a) => fc.tuple(fc.constant(a), near(a))), schema.chain((b) => fc.tuple(near(b), fc.constant(b))))
  .filter(([a, b]) => checkSchema(a, "entity", ROOT).ok && checkSchema(b, "entity", ROOT).ok)
  .chain(([a, b]) => fc.tuple(fc.constant(deepFreeze(a)), fc.constant(deepFreeze(b)), fc.array(fc.oneof(valueOf(a), valueOf(b)), { minLength: 8, maxLength: 8 })));

describe("compare is sound (KR-22, R2)", () => {
  it("KR-22: revision — narrower or same keeps every value of A valid under B; wider or same, every value of B under A", () => {
    fc.assert(
      fc.property(pairs, ([a, b, values]) => {
        const { relation } = compare(a, b, "revision", TYPES);
        for (const v of values) {
          if (relation === "narrower" || relation === "same") expect([v, valid(v, a) && !valid(v, b)]).toEqual([v, false]);
          if (relation === "wider" || relation === "same") expect([v, valid(v, b) && !valid(v, a)]).toEqual([v, false]);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("KR-22, KR-15: extends — narrower or same keeps every value of A, restricted to B's fields, valid under B", () => {
    fc.assert(
      fc.property(pairs, ([a, b, values]) => {
        const { relation } = compare(a, b, "extends", TYPES);
        if (relation !== "narrower" && relation !== "same") return;
        for (const v of values) expect([v, valid(v, a) && !valid(restrict(v, b), b)]).toEqual([v, false]);
      }),
      { numRuns: 2000 },
    );
  });

  it("the grammar gives pairs that relate, not only incomparable ones", () => {
    const relations = fc.sample(pairs, { numRuns: 1000, seed: 7 }).map(([a, b]) => compare(a, b, "revision", TYPES).relation);
    const containers = fc
      .sample(pairs, { numRuns: 1000, seed: 7 })
      .filter(([a, b]) => a.type === "object" && b.type === "object" && compare(a, b, "revision", TYPES).relation !== "incomparable");
    expect(relations.filter((r) => r === "narrower").length).toBeGreaterThan(50);
    expect(relations.filter((r) => r === "wider").length).toBeGreaterThan(50);
    expect(relations.filter((r) => r === "same").length).toBeGreaterThan(20);
    expect(containers.length).toBeGreaterThan(5);
  });
});
