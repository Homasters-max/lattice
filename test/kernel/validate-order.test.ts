// validate (KR-21): violations in a deterministic order (CONVENTIONS.md §5)
// whatever the order of the keys of the value and the schema; nothing read but
// the caller's `resolve`. The hard check that refuses each violation of a body
// with KR-21 is phase 2 of one record, against-type.test.ts. Every input
// crosses the module boundary frozen.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validate, type JsonValue, type Schema } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const SHAPE = { type: "object", properties: { n: { type: "integer", minimum: 0 }, s: { type: "string", maxLength: 2 } }, required: ["n"] };

/** A schema with every kind of keyword, so that a random value meets many of them at once. */
const SCHEMA: Schema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 3 },
    count: { type: ["integer", "null"], minimum: 0, maximum: 9 },
    tags: { type: "array", items: { type: "string", format: "ulid" }, maxItems: 2 },
    meta: { type: "object", values: { $ref: "demo/shape@1" } },
    kind: { enum: ["a", "b", 1] },
    shape: { $ref: "demo/shape@1" },
  },
  required: ["title", "kind", "shape"],
};

const resolve = (ref: string): Schema | null => (ref === "demo/shape@1" ? SHAPE : null);

/** The same value with the keys of every object in another order, chosen by `seed`. */
function shuffled(value: JsonValue, seed: number): JsonValue {
  if (Array.isArray(value)) return value.map((v: JsonValue, i) => shuffled(v, seed + i));
  if (typeof value !== "object" || value === null) return value;
  const keys = Object.keys(value).sort((a, b) => ((hashOf(a) ^ seed) & 7) - ((hashOf(b) ^ seed) & 7));
  return Object.fromEntries(keys.map((k) => [k, shuffled((value as { readonly [k: string]: JsonValue })[k] ?? null, seed * 31 + 1)]));
}

const hashOf = (s: string): number => [...s].reduce((h, c) => (h * 33 + (c.codePointAt(0) ?? 0)) | 0, 5);

/** A value with the fields of SCHEMA, each a fitting or an unfitting value, and a stray field now and then. */
const anyValue: fc.Arbitrary<JsonValue> = fc.dictionary(
  fc.constantFrom("title", "count", "tags", "meta", "kind", "shape", "stray", "Bad"),
  fc.oneof(fc.jsonValue({ maxDepth: 2 }), fc.constant({ n: -1, s: "abc", x: 1 }), fc.constant({ "a.b": { n: 1 }, B: { n: "x" } })),
) as fc.Arbitrary<JsonValue>;

describe("the order of violations (KR-21)", () => {
  it("KR-21: is by path, then keyword, then expected and got", () => {
    const out = validate(deepFreeze({ title: "", kind: "c", shape: { n: -1, s: "abc" }, stray: 1 }), deepFreeze(SCHEMA), resolve);
    expect(out.ok ? [] : out.violations.map((v) => `${v.path} ${v.keyword}`)).toEqual([
      "/kind enum",
      "/shape/n minimum",
      "/shape/s maxLength",
      "/stray properties",
      "/title minLength",
    ]);
  });

  it("KR-21: does not change when the keys of the value or the schema are in another order", () => {
    fc.assert(
      fc.property(anyValue, fc.integer({ min: 0, max: 1000 }), (value, seed) => {
        const once = validate(deepFreeze(value), deepFreeze(SCHEMA), resolve);
        const again = validate(deepFreeze(shuffled(value, seed)), deepFreeze(shuffled(SCHEMA, seed + 1) as Schema), resolve);
        expect(again).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });
});

describe("what validate reads (KR-21)", () => {
  it("KR-21: reads nothing but resolve, and resolve only for a $ref", () => {
    const asked: string[] = [];
    const spy = (ref: string) => (asked.push(ref), resolve(ref));
    const value = deepFreeze({ title: "a", kind: "a", shape: { n: 1 }, meta: { x: { n: 2 } } });
    const first = validate(value, deepFreeze(SCHEMA), spy);
    expect([first, validate(value, deepFreeze(SCHEMA), spy)]).toEqual([{ ok: true }, { ok: true }]);
    expect(asked).toEqual(["demo/shape@1", "demo/shape@1", "demo/shape@1", "demo/shape@1"]);
    asked.length = 0;
    expect([validate(deepFreeze({ n: 1 }), deepFreeze(SHAPE), spy), asked]).toEqual([{ ok: true }, []]);
  });
});
