// Annotations (KR-19): each one only where the closed subset puts it and in
// its form (G-23). A field is a member of `properties`, at any depth; the
// root, `items`, `values` and the branches of `oneOf` are not fields. Every
// input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import { checkSchema, KR_19, reject, type JsonValue, type Kind } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ROOT = { intent: null, path: "" } as const;

const refusals = (schema: JsonValue, kind: Kind = "entity") => checkSchema(deepFreeze(schema), kind, ROOT).map((r) => [r.rule, r.path]);

/** A closed object with one field `a` of this schema, required or not. */
const field = (a: JsonValue, required = true) => ({ type: "object", properties: { a }, required: required ? ["a"] : [] });

const REF = { type: "string", format: "ref" } as const;
const URI = { type: "string", format: "uri" } as const;
const TO = { to: "demo/shape@1", pin: "pinned", label: "about" } as const;

describe("ref and edge (KR-19)", () => {
  it("KR-19: ref sits on a format: ref schema — a field, an item, a map value", () => {
    expect(refusals(field({ ...REF, ref: TO }))).toEqual([]);
    expect(refusals(field({ type: "array", items: { ...REF, ref: { ...TO, pin: "any" } } }))).toEqual([]);
    expect(refusals(field({ type: "object", values: { ...REF, ref: { ...TO, pin: "floating" } } }))).toEqual([]);
    expect(refusals(field({ ...URI, ref: TO }))).toEqual([["KR-19", "/properties/a/ref"]]);
    expect(refusals(field({ type: "string", ref: TO }))).toEqual([["KR-19", "/properties/a/ref"]]);
  });

  it("KR-19: ref is exactly {to, pin, label}: a pinned type, pinned, floating or any, and a label", () => {
    const broken: readonly (readonly [JsonValue, string])[] = [
      ["about", "/properties/a/ref"],
      [{ to: TO.to, pin: TO.pin }, "/properties/a/ref/label"],
      [{ ...TO, to: "demo/shape" }, "/properties/a/ref/to"],
      [{ ...TO, to: "demo/shape@1#a" }, "/properties/a/ref/to"],
      [{ ...TO, pin: "loose" }, "/properties/a/ref/pin"],
      [{ ...TO, label: 1 }, "/properties/a/ref/label"],
      [{ ...TO, why: "x" }, "/properties/a/ref/why"],
    ];
    for (const [ref, path] of broken) expect([ref, refusals(field({ ...REF, ref }))]).toEqual([ref, [["KR-19", path]]]);
  });

  it("KR-19: edge sits on a format: uri schema and is a label", () => {
    expect(refusals(field({ ...URI, edge: "about" }))).toEqual([]);
    expect(refusals(field({ ...REF, edge: "about" }))).toEqual([["KR-19", "/properties/a/edge"]]);
    expect(refusals(field({ ...URI, edge: true }))).toEqual([["KR-19", "/properties/a/edge"]]);
  });

  it("KR-19: refuses with where the annotation belongs and where it sits", () => {
    expect(checkSchema(deepFreeze(field({ ...URI, ref: TO }, false)), "entity", ROOT)).toEqual([
      reject(KR_19, { intent: null, path: "/properties/a/ref", expected: "a format: ref schema", got: "an optional field of an entity type, format: uri" }),
    ]);
  });
});

describe("unique, key and card_order (KR-19)", () => {
  it("KR-19: unique sits on a required field, at any depth, and is true", () => {
    expect(refusals(field({ type: "string", unique: true }))).toEqual([]);
    expect(refusals(field(field({ type: "string", unique: true })))).toEqual([]);
    expect(refusals(field({ type: "string", unique: true }, false))).toEqual([["KR-19", "/properties/a/unique"]]);
    expect(refusals({ type: "string", unique: true })).toEqual([["KR-19", "/unique"]]);
    expect(refusals(field({ type: "array", items: { type: "string", unique: true } }))).toEqual([["KR-19", "/properties/a/items/unique"]]);
    expect(refusals(field({ type: "string", unique: false }))).toEqual([["KR-19", "/properties/a/unique"]]);
  });

  it("KR-19: key sits on a required field of an event type and is true", () => {
    expect(refusals(field({ type: "string", key: true }), "event")).toEqual([]);
    expect(refusals(field({ type: "string", key: true }), "entity")).toEqual([["KR-19", "/properties/a/key"]]);
    expect(refusals(field({ type: "string", key: true }, false), "event")).toEqual([["KR-19", "/properties/a/key"]]);
    expect(refusals(field({ type: "string", key: 1 }), "event")).toEqual([["KR-19", "/properties/a/key"]]);
  });

  it("KR-19: card_order sits on any field, required or not, and is an integer", () => {
    expect(refusals(field({ type: "string", card_order: 1 }, false))).toEqual([]);
    expect(refusals(field({ type: "string", card_order: -2 }))).toEqual([]);
    expect(refusals(field({ type: "string", card_order: 1.5 }))).toEqual([["KR-19", "/properties/a/card_order"]]);
    expect(refusals({ type: "string", card_order: 1 })).toEqual([["KR-19", "/card_order"]]);
    expect(refusals(field({ type: "object", values: { type: "string", card_order: 1 } }))).toEqual([["KR-19", "/properties/a/values/card_order"]]);
  });

  it("KR-19: a branch of oneOf is no field, its members are", () => {
    const union = { oneOf: [{ type: "object", properties: { kind: { const: "a", card_order: 1 } }, required: ["kind"], card_order: 2 }], discriminator: "kind" };
    expect(refusals(union)).toEqual([["KR-19", "/oneOf/0/card_order"]]);
  });
});
