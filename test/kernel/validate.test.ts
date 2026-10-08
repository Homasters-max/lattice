// validate (KR-21): a value against a schema of the subset, keyword by
// keyword; cardinality by minItems and maxItems (KR-20); `$ref` resolved only
// through the caller's function. The order of violations and the purity of
// validate are in validate-order.test.ts. Every input crosses the module
// boundary frozen.
import { describe, expect, it } from "vitest";
import { validate, type JsonValue, type Schema, type Violation } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const NONE = () => null;

/** KR-21: the schema the caller gives for a `$ref`, or `null`. */
type Resolve = (ref: string) => Schema | null;

/** The path and keyword of every violation of a value against a schema. */
function violations(value: JsonValue, schema: Schema, resolve: Resolve = NONE): (readonly [string, string])[] {
  const out = validate(deepFreeze(value), deepFreeze(schema), resolve);
  return out.ok ? [] : out.violations.map((v) => [v.path, v.keyword] as const);
}

/** Each keyword with a value it takes and a value it refuses at the root. */
const KEYWORDS: readonly (readonly [Schema, JsonValue, JsonValue, string])[] = [
  [{ type: "string" }, "a", 1, "type"],
  [{ type: "integer" }, 3, 1.5, "type"],
  [{ type: "number" }, 1.5, "1.5", "type"],
  [{ type: "boolean" }, false, null, "type"],
  [{ type: "null" }, null, 0, "type"],
  [{ type: "object" }, {}, [], "type"],
  [{ type: "array" }, [], {}, "type"],
  [{ type: ["string", "null"] }, null, 1, "type"],
  [{ type: "string", minLength: 2 }, "ab", "a", "minLength"],
  [{ type: "string", maxLength: 1 }, "\u{1F600}", "ab", "maxLength"],
  [{ type: "number", minimum: 0 }, 0, -0.5, "minimum"],
  [{ type: "integer", maximum: 10 }, 10, 11, "maximum"],
  [{ enum: ["a", 1, null] }, 1, "b", "enum"],
  [{ const: "fact" }, "fact", "facts", "const"],
  [{ type: "string", format: "date-time" }, "2026-10-06T12:00:00.000000Z", "2026-10-06T12:00:00Z", "format"],
  [{ type: "string", format: "date" }, "2026-02-28", "2026-02-30", "format"],
  [{ type: "string", format: "decimal" }, "-12.25", "1.50", "format"],
  [{ type: "string", format: "ulid" }, "01JB2X00000000000000000SES", "01jb2x00000000000000000ses", "format"],
  [{ type: "string", format: "ref" }, "demo/hello@2#items/0", "Demo/hello", "format"],
  [{ type: "string", format: "uri" }, "https://example.com/a", "docs/a.md", "format"],
  [{ type: "string", description: "anything" }, "a", 1, "type"],
];

describe("each keyword (KR-21)", () => {
  it("KR-21: takes a value the keyword admits and refuses one it does not, at the root", () => {
    for (const [schema, good, bad, keyword] of KEYWORDS) {
      expect([schema, violations(good, schema), violations(bad, schema)]).toEqual([schema, [], [["", keyword]]]);
    }
  });

  it("KR-21: a violation is {path, keyword, expected, got}", () => {
    expect(validate(deepFreeze({ a: 1 }), deepFreeze({ type: "object", properties: { a: { type: "string" } } }), NONE)).toEqual({
      ok: false,
      violations: [{ path: "/a", keyword: "type", expected: "string", got: 1 }],
    });
  });

  it("KR-21: each violation names what its keyword wants and what came", () => {
    const loop = () => ({ $ref: "demo/loop@1" });
    const union = { oneOf: [{ type: "object", properties: { kind: { const: "a" } }, required: ["kind"] }], discriminator: "kind" };
    const cases: readonly (readonly [JsonValue, Schema, Violation, Resolve?])[] = [
      ["a", { type: "string", minLength: 2 }, { path: "", keyword: "minLength", expected: 2, got: 1 }],
      ["\u{1F600}\u{1F600}", { type: "string", maxLength: 1 }, { path: "", keyword: "maxLength", expected: 1, got: 2 }],
      [-0.5, { type: "number", minimum: 0 }, { path: "", keyword: "minimum", expected: 0, got: -0.5 }],
      [11, { type: "integer", maximum: 10 }, { path: "", keyword: "maximum", expected: 10, got: 11 }],
      [[], { type: "array", minItems: 1 }, { path: "", keyword: "minItems", expected: 1, got: 0 }],
      [[1, 2, 3], { type: "array", maxItems: 2 }, { path: "", keyword: "maxItems", expected: 2, got: 3 }],
      ["b", { enum: ["a", 1, null] }, { path: "", keyword: "enum", expected: ["a", 1, null], got: "b" }],
      ["facts", { const: "fact" }, { path: "", keyword: "const", expected: "fact", got: "facts" }],
      ["2026-02-30", { type: "string", format: "date" }, { path: "", keyword: "format", expected: "date", got: "2026-02-30" }],
      [{ extra: true }, { type: "object" }, { path: "/extra", keyword: "properties", expected: "absent", got: true }],
      [{}, { type: "object", properties: { title: { type: "string" } }, required: ["title"] }, { path: "/title", keyword: "required", expected: "present", got: "absent" }],
      [{ Bad: 1 }, { type: "object", values: { type: "integer" } }, { path: "/Bad", keyword: "values", expected: "a key [a-z0-9][a-z0-9._@-]*", got: "Bad" }],
      ["a", union, { path: "", keyword: "oneOf", expected: "an object", got: "a" }],
      [{ kind: "c" }, union, { path: "/kind", keyword: "discriminator", expected: ["a"], got: "c" }],
      [1, { $ref: "demo/other@1" }, { path: "", keyword: "$ref", expected: "a schema resolve knows", got: "demo/other@1" }],
      [1, { $ref: "demo/loop@1" }, { path: "", keyword: "$ref", expected: "a schema, not a cycle of $ref", got: "demo/loop@1" }, loop],
    ];
    for (const [value, schema, violation, resolve = NONE] of cases) {
      expect([schema, validate(deepFreeze(value), deepFreeze(schema), resolve)]).toEqual([schema, { ok: false, violations: [violation] }]);
    }
  });

  it("KR-21: a string is measured in code points; a value of the wrong type meets no other keyword", () => {
    expect(violations("\u{1F600}\u{1F600}", { type: "string", maxLength: 1 })).toEqual([["", "maxLength"]]);
    expect(violations(5, { type: "string", minLength: 2, format: "date" })).toEqual([["", "type"]]);
  });

  it("KR-21: annotations are not checked by validate — pin and label are phase 4's", () => {
    const schema = { type: "string", format: "ref", ref: { to: "demo/shape@1", pin: "pinned", label: "about" }, card_order: 1 };
    expect(violations("demo/hello", schema)).toEqual([]);
  });
});

describe("objects, maps and arrays (KR-21, KR-20)", () => {
  const note = { type: "object", properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title"] };

  it("KR-21: an object is closed: an unlisted key and a missing required field are violations", () => {
    expect(violations({ title: "a", tags: ["x"] }, note)).toEqual([]);
    expect(violations({ tags: ["x", 2], extra: true }, note)).toEqual([
      ["/extra", "properties"],
      ["/tags/1", "type"],
      ["/title", "required"],
    ]);
  });

  it("KR-21: a map takes keys [a-z0-9][a-z0-9._@-]*, each value against values", () => {
    const map = { type: "object", values: { type: "integer" } };
    expect(violations({ "a.b@1": 1, "0-x_y": 2 }, map)).toEqual([]);
    expect(violations({ Bad: 1, ok: "x" }, map)).toEqual([
      ["/Bad", "values"],
      ["/ok", "type"],
    ]);
  });

  it("KR-20: cardinality is the array with minItems and maxItems", () => {
    const many = { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 };
    expect([violations(["a"], many), violations(["a", "b"], many)]).toEqual([[], []]);
    expect([violations([], many), violations(["a", "b", "c"], many)]).toEqual([[["", "minItems"]], [["", "maxItems"]]]);
  });

  it("KR-21: a path escapes a key as JSON Pointer does", () => {
    expect(violations({ "a/b": 1, "c~d": 2 }, { type: "object" })).toEqual([
      ["/a~1b", "properties"],
      ["/c~0d", "properties"],
    ]);
  });
});

describe("any value (KR-21, G-38)", () => {
  const values: readonly JsonValue[] = ["a", 1.5, -3, true, null, [], [1, "a", { Bad: [] }], {}, { Bad: { "a/b": null }, kids: [1, {}] }];

  it("KR-21: type any takes a string, a number, a boolean, null, an array and an object", () => {
    for (const value of values) expect([value, validate(deepFreeze(value), deepFreeze({ type: "any" }), NONE)]).toEqual([value, { ok: true }]);
  });

  it("KR-21: type any does not descend into its value — no key grammar, no closed object inside it", () => {
    const holder = { type: "object", properties: { input: { type: "any", description: "anything" }, n: { type: "integer" } }, required: ["input"] };
    for (const input of values) expect([input, violations({ input }, holder)]).toEqual([input, []]);
    expect(violations({ n: "x" }, holder)).toEqual([
      ["/input", "required"],
      ["/n", "type"],
    ]);
    expect(violations([{ Bad: 1 }, "a"], { type: "array", items: { type: "any" } })).toEqual([]);
  });
});

describe("oneOf and $ref (KR-21)", () => {
  const branch = (tag: JsonValue, properties: object = {}) => ({ type: "object", properties: { kind: { const: tag }, ...properties }, required: ["kind"] });
  const union = { oneOf: [branch("a", { x: { type: "string" } }), branch("b")], discriminator: "kind" };

  it("KR-21: oneOf picks the branch its discriminator names and checks the value against it", () => {
    expect(violations({ kind: "a", x: "1" }, union)).toEqual([]);
    expect(violations({ kind: "b", x: "1" }, union)).toEqual([["/x", "properties"]]);
    expect(violations({ kind: "c" }, union)).toEqual([["/kind", "discriminator"]]);
    expect(violations({}, union)).toEqual([["/kind", "discriminator"]]);
    expect(violations("a", union)).toEqual([["", "oneOf"]]);
  });

  it("KR-21: a tag picks the branch whose const it is, not one that only reads the same — 1 is not \"1\"", () => {
    const typed = { oneOf: [branch(1, { x: { type: "string" } }), branch("1"), branch(true), branch("true")], discriminator: "kind" };
    expect([violations({ kind: 1, x: "a" }, typed), violations({ kind: "1", x: "a" }, typed)]).toEqual([[], [["/x", "properties"]]]);
    expect([violations({ kind: true }, typed), violations({ kind: "true" }, typed)]).toEqual([[], []]);
  });

  it("KR-21: reads only the value's own members — a discriminator named constructor is absent from {}", () => {
    const named = { oneOf: [{ type: "object", properties: { constructor: { const: "a" } }, required: ["constructor"] }], discriminator: "constructor" };
    expect(validate(deepFreeze({}), deepFreeze(named), NONE)).toEqual({
      ok: false,
      violations: [{ path: "/constructor", keyword: "discriminator", expected: ["a"], got: "absent" }],
    });
  });

  it("KR-21: $ref is resolved by the caller's function; an unknown target is a violation", () => {
    const shape = { type: "object", properties: { n: { type: "integer" } }, required: ["n"] };
    const resolve = (ref: string) => (ref === "demo/shape@1" ? shape : null);
    const holder = { type: "object", properties: { s: { $ref: "demo/shape@1" }, t: { $ref: "demo/other@1" } } };
    expect(violations({ s: { n: 1 } }, holder, resolve)).toEqual([]);
    expect(violations({ s: {}, t: 1 }, holder, resolve)).toEqual([
      ["/s/n", "required"],
      ["/t", "$ref"],
    ]);
  });

  it("KR-21: a $ref that resolves to itself is a violation, not a loop; a recursive shape is fine", () => {
    expect(violations(1, { $ref: "demo/loop@1" }, () => ({ $ref: "demo/loop@1" }))).toEqual([["", "$ref"]]);
    const tree = { type: "object", properties: { kids: { type: "array", items: { $ref: "demo/tree@1" } } } };
    expect(violations({ kids: [{ kids: [{}] }, { kids: [1] }] }, { $ref: "demo/tree@1" }, () => tree)).toEqual([["/kids/1/kids/0", "type"]]);
  });
});
