// The schema subset (KR-18) and cardinality (KR-20): every keyword taken where
// it applies and refused where it does not, every keyword outside the subset
// refused, objects always closed, `$ref` and `oneOf` in their form (G-22).
// Annotations (KR-19) are in schema-annotations.test.ts. Every input crosses
// the module boundary frozen.
import { describe, expect, it } from "vitest";
import { checkSchema, KR_18, reject, type JsonValue, type Kind } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ROOT = { intent: null, path: "" } as const;

/** The rule and path of every rejection of a schema checked from the root. */
const refusals = (schema: JsonValue, kind: Kind = "entity") => checkSchema(deepFreeze(schema), kind, ROOT).map((r) => [r.rule, r.path]);

/** A closed object of these fields, every one optional. */
const object = (properties: { readonly [name: string]: JsonValue }) => ({ type: "object", properties });

const SHAPE = "demo/shape@1";

/** One schema per keyword of KR-18, each where it applies. */
const TAKEN: readonly (readonly [string, JsonValue])[] = [
  ["type", { type: "string" }],
  ["type with null", { type: ["integer", "null"] }],
  ["null with type", { type: ["null", "object"] }],
  ["properties and required", { type: "object", properties: { title: { type: "string" } }, required: ["title"] }],
  ["an empty closed object", { type: "object" }],
  ["values", { type: "object", values: { type: "integer" } }],
  ["items, minItems, maxItems", { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 }],
  ["minLength, maxLength", { type: "string", minLength: 0, maxLength: 200 }],
  ["minimum, maximum on a number", { type: "number", minimum: -1.5, maximum: 2 }],
  ["minimum on an integer with null", { type: ["integer", "null"], minimum: 0 }],
  ["enum", { enum: ["draft", "final", 1, true, null] }],
  ["enum with a scalar type", { type: "string", enum: ["a", "b"] }],
  ["const", { const: "fact" }],
  ["$ref", { $ref: SHAPE }],
  ["$ref with a description", { $ref: SHAPE, description: "a shape" }],
  ["description anywhere", { type: "object", description: "a note", properties: { a: { type: "boolean", description: "flag" } } }],
  ...["date-time", "date", "decimal", "ulid", "ref", "uri"].map((f): [string, JsonValue] => [`format ${f}`, { type: "string", format: f }]),
  [
    "oneOf with discriminator",
    {
      oneOf: [
        { type: "object", properties: { kind: { const: "a" }, x: { type: "string" } }, required: ["kind"] },
        { type: "object", properties: { kind: { const: "b" } }, required: ["kind"] },
      ],
      discriminator: "kind",
    },
  ],
];

describe("the schema subset (KR-18)", () => {
  it("KR-18: takes every keyword where it applies", () => {
    for (const [name, schema] of TAKEN) expect([name, refusals(schema)]).toEqual([name, []]);
  });

  it("KR-18: refuses every keyword outside the subset, at the path of the keyword", () => {
    const outside = ["pattern", "additionalProperties", "allOf", "anyOf", "not", "if", "then", "else", "patternProperties", "propertyNames"];
    const more = ["uniqueItems", "contains", "prefixItems", "multipleOf", "exclusiveMinimum", "default", "examples", "title", "$defs", "$id", "$schema"];
    for (const keyword of [...outside, ...more]) {
      expect([keyword, refusals(object({ a: { type: "string", [keyword]: true } }))]).toEqual([keyword, [["KR-18", `/properties/a/${keyword}`]]]);
    }
  });

  it("KR-18: refuses the keyword itself, with the subset as expected and the keyword as got", () => {
    expect(checkSchema(deepFreeze({ type: "string", pattern: "^a" }), "entity", { intent: "demo/t", path: "/body/schema" })).toEqual([
      reject(KR_18, { intent: "demo/t", path: "/body/schema/pattern", expected: "a keyword of KR-18 or an annotation of KR-19", got: "pattern" }),
    ]);
  });

  it("KR-18: refuses a keyword where it does not apply, with the types it applies to", () => {
    const misplaced: readonly (readonly [JsonValue, string])[] = [
      [{ type: "string", minItems: 1 }, "/minItems"],
      [{ type: "array", minLength: 1 }, "/minLength"],
      [{ type: "integer", format: "date" }, "/format"],
      [{ type: "string", minimum: 1 }, "/minimum"],
      [{ type: "string", properties: {} }, "/properties"],
      [{ type: "array", required: [] }, "/required"],
      [{ type: "string", values: { type: "string" } }, "/values"],
      [{ type: "object", items: { type: "string" } }, "/items"],
      [{ type: "null", maxLength: 1 }, "/maxLength"],
      [{ enum: ["a"], maxLength: 1 }, "/maxLength"],
      [{ type: "object", enum: ["a"] }, "/enum"],
      [{ type: ["array", "null"], const: 1 }, "/const"],
    ];
    for (const [schema, path] of misplaced) expect([schema, refusals(schema)]).toEqual([schema, [["KR-18", path]]]);
    expect(checkSchema(deepFreeze({ type: "string", minItems: 1 }), "entity", ROOT)[0]).toMatchObject({ expected: ["array"], got: "string" });
  });
});

describe("the form of each keyword (KR-18)", () => {
  it("KR-18: refuses a malformed value of a keyword, at its path", () => {
    const malformed: readonly (readonly [JsonValue, string])[] = [
      [{ type: "text" }, "/type"],
      [{ type: ["string", "integer"] }, "/type"],
      [{ type: ["null", "null"] }, "/type"],
      [{ type: ["string"] }, "/type"],
      [{ type: "string", format: "email" }, "/format"],
      [{ type: "string", minLength: -1 }, "/minLength"],
      [{ type: "string", maxLength: 1.5 }, "/maxLength"],
      [{ type: "array", maxItems: "2" }, "/maxItems"],
      [{ type: "number", minimum: "1" }, "/minimum"],
      [{ enum: [] }, "/enum"],
      [{ enum: [{}] }, "/enum"],
      [{ enum: [1, 1] }, "/enum"],
      [{ const: [] }, "/const"],
      [{ type: "string", description: 1 }, "/description"],
      [{ type: "object", properties: [] }, "/properties"],
      [{ type: "object", required: "a" }, "/required"],
      [{ $ref: "demo/shape" }, "/$ref"],
      [{ $ref: "demo/shape@1#a" }, "/$ref"],
      [{ $ref: 1 }, "/$ref"],
    ];
    for (const [schema, path] of malformed) expect([schema, refusals(schema)]).toEqual([schema, [["KR-18", path]]]);
  });

  it("KR-18: refuses a schema that is no object, and walks into every nested schema", () => {
    expect(refusals(true)).toEqual([["KR-18", ""]]);
    expect(refusals({ type: "array", items: 1 })).toEqual([["KR-18", "/items"]]);
    const nested = object({ a: { type: "array", items: { type: "object", values: { type: "string", pattern: "x" } } } });
    expect(refusals(nested)).toEqual([["KR-18", "/properties/a/items/values/pattern"]]);
  });

  it("KR-18: a field is named [a-z][a-z0-9_]* (KR-23); required names a field of properties, once", () => {
    expect(refusals(object({ Title: { type: "string" }, a_1: { type: "string" } }))).toEqual([["KR-18", "/properties/Title"]]);
    expect(refusals(object({ "a/b": { type: "string" } }))).toEqual([["KR-18", "/properties/a~1b"]]);
    const required = { type: "object", properties: { a: { type: "string" } }, required: ["a", "b", "a"] };
    expect(refusals(required)).toEqual([
      ["KR-18", "/required/1"],
      ["KR-18", "/required/2"],
    ]);
  });
});

describe("objects are always closed (KR-18)", () => {
  it("KR-18: refuses a schema that would admit any object — no type, $ref, oneOf, enum or const", () => {
    expect(refusals({})).toEqual([["KR-18", ""]]);
    expect(refusals(object({ note: { description: "anything" } }))).toEqual([["KR-18", "/properties/note"]]);
    expect(refusals({ type: "object", additionalProperties: true })).toEqual([["KR-18", "/additionalProperties"]]);
  });

  it("KR-18: an object is a record of fields or a map, never both", () => {
    expect(refusals({ type: "object", properties: {}, values: { type: "string" } })).toEqual([["KR-18", "/values"]]);
  });

  it("KR-18: $ref stands alone, beside only a description and annotations", () => {
    expect(refusals({ $ref: SHAPE, type: "object" })).toEqual([["KR-18", "/type"]]);
    expect(refusals(object({ a: { $ref: SHAPE, card_order: 1 } }))).toEqual([]);
  });
});

describe("tagged unions (KR-18)", () => {
  const branch = (tag: JsonValue, rest: object = {}) => ({ type: "object", properties: { kind: { const: tag } }, required: ["kind"], ...rest });

  it("KR-18: oneOf comes with a discriminator, and a discriminator with oneOf", () => {
    expect(refusals({ oneOf: [branch("a")] })).toEqual([["KR-18", "/discriminator"]]);
    expect(refusals({ type: "string", discriminator: "kind" })).toEqual([["KR-18", "/discriminator"]]);
    expect(refusals({ oneOf: [branch("a")], discriminator: "Kind" })).toEqual([["KR-18", "/discriminator"]]);
    expect(refusals({ oneOf: [], discriminator: "kind" })).toEqual([["KR-18", "/oneOf"]]);
    expect(refusals({ oneOf: [branch("a")], discriminator: "kind", type: "object" })).toEqual([["KR-18", "/type"]]);
  });

  it("KR-18: each branch is an object whose discriminator field is a required, distinct const", () => {
    const union = (...branches: JsonValue[]) => refusals({ oneOf: branches, discriminator: "kind" });
    expect(union(branch("a"), branch("b"))).toEqual([]);
    expect(union(branch("a"), { type: "string" })).toEqual([["KR-18", "/oneOf/1/type"]]);
    expect(union(branch("a"), { type: "object", properties: { other: { type: "string" } } })).toEqual([
      ["KR-18", "/oneOf/1/properties/kind"],
      ["KR-18", "/oneOf/1/required"],
    ]);
    expect(union(branch("a"), { type: "object", properties: { kind: { type: "string" } }, required: ["kind"] })).toEqual([["KR-18", "/oneOf/1/properties/kind"]]);
    expect(union(branch("a"), branch("b", { required: [] }))).toEqual([["KR-18", "/oneOf/1/required"]]);
    expect(union(branch("a"), branch("a"))).toEqual([["KR-18", "/oneOf/1/properties/kind/const"]]);
  });

  it("KR-18: reads only the schema's own members — a discriminator named constructor is absent from a branch without it", () => {
    const out = checkSchema(deepFreeze({ oneOf: [{ type: "object", properties: {}, required: [] }], discriminator: "constructor" }), "entity", ROOT);
    expect(out.map((r) => [r.path, r.got])).toEqual([
      ["/oneOf/0/properties/constructor", "absent"],
      ["/oneOf/0/required", []],
    ]);
  });
});

describe("cardinality (KR-20)", () => {
  it("KR-20: is a single field or an array with minItems and maxItems, and no other keyword", () => {
    expect(refusals(object({ one: { type: "string" }, many: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 } }))).toEqual([]);
    for (const keyword of ["cardinality", "minProperties", "maxProperties", "minContains", "maxContains", "uniqueItems"]) {
      expect([keyword, refusals({ type: "array", items: { type: "string" }, [keyword]: 1 })]).toEqual([keyword, [["KR-18", `/${keyword}`]]]);
    }
  });
});

describe("the order of rejections (KR-18)", () => {
  it("KR-18: rejections come sorted by path, whatever the order of the keys", () => {
    const schema = { type: "object", properties: { b: { type: "string", pattern: "x" }, a: { type: "x" } }, title: "t" };
    expect(refusals(schema)).toEqual([
      ["KR-18", "/properties/a/type"],
      ["KR-18", "/properties/b/pattern"],
      ["KR-18", "/title"],
    ]);
  });
});
