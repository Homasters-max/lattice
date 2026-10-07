// compare (KR-22): a row per statement of the rule — a pair of schemas, the
// mode, and the {relation, aspects} it gives. `incomparable` is the safe side:
// whatever narrowness cannot be shown structurally is incomparable (R2). The
// soundness of `narrower` and `same` over values is compare.property.test.ts.
// Every input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import { compare, type JsonValue, type Mode, type ResolveType, type Schema } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

type Comparison = ReturnType<typeof compare>;

/** The type bodies a test knows by pinned reference. */
const TYPES: { readonly [ref: string]: JsonValue } = {
  "demo/base@1": { abstract: true, kind: "entity", schema: { type: "object", properties: {} } },
  "demo/child@1": { extends: "demo/base@1", abstract: false, kind: "entity", schema: { type: "object", properties: {} } },
  "demo/other@1": { abstract: false, kind: "entity", schema: { type: "object", properties: {} } },
  "demo/span@1": { abstract: true, kind: "entity", schema: { type: "object", properties: { n: { type: "integer", maximum: 10 } }, required: ["n"] } },
  "demo/span@2": { abstract: true, kind: "entity", schema: { type: "object", properties: { n: { type: "integer", maximum: 5 } }, required: ["n"] } },
  "demo/span@3": { abstract: true, kind: "entity", schema: { type: "object", properties: { n: { type: "integer", maximum: 10 } }, required: ["n"] } },
  "demo/tree@1": { abstract: true, kind: "entity", schema: { type: "object", properties: { kids: { type: "array", items: { $ref: "demo/tree@1" } } } } },
  "demo/tree@2": { abstract: true, kind: "entity", schema: { type: "object", properties: { kids: { type: "array", items: { $ref: "demo/tree@2" } } } } },
  "demo/odd@1": { abstract: true, kind: "entity", schema: { type: "array", const: [1], items: 5 } },
  "demo/oddchild@1": { extends: "demo/base@1", abstract: false, kind: "entity", schema: { type: "array", const: [1], items: 5 } },
};

const resolve: ResolveType = (ref) => (Object.hasOwn(TYPES, ref) ? (TYPES[ref] ?? null) : null);

const run = (a: Schema, b: Schema, mode: Mode = "revision"): Comparison => compare(deepFreeze(a), deepFreeze(b), mode, resolve);

/** A closed object with these fields, all of them required unless `optional` names them. */
const object = (properties: { readonly [name: string]: Schema }, optional: readonly string[] = []): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
});

const S: Schema = { type: "string" };
const REF = (ref: { readonly [k: string]: string }): Schema => ({ type: "string", format: "ref", ref: { to: "demo/base@1", pin: "any", label: "about", ...ref } });

type Row = readonly [string, Schema, Schema, Mode, Comparison];

const rows: readonly Row[] = [
  // relation
  ["same: equal schemas", object({ a: S }), object({ a: S }), "revision", { relation: "same", aspects: [] }],
  ["narrower: a shorter maximum length", { type: "string", maxLength: 5 }, { type: "string", maxLength: 10 }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["wider: a longer maximum length", { type: "string", maxLength: 10 }, { type: "string", maxLength: 5 }, "revision", { relation: "wider", aspects: ["validity"] }],
  ["incomparable: another type", { type: "string" }, { type: "integer" }, "revision", { relation: "incomparable", aspects: ["validity"] }],
  ["incomparable: narrowness that cannot be shown structurally", { type: "string", format: "date" }, { type: "string", maxLength: 10 }, "revision", { relation: "incomparable", aspects: ["validity"] }],
  ["narrower: enum within the type", { type: "string", enum: ["a", "b"] }, S, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["narrower: const within enum", { const: "a" }, { enum: ["a", "b"] }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["same: enum and const of one value", { const: "a" }, { enum: ["a"] }, "revision", { relation: "same", aspects: [] }],
  ["narrower: integer within number", { type: "integer", minimum: 0 }, { type: "number" }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["wider: a type paired with null", { type: ["string", "null"] }, S, "revision", { relation: "wider", aspects: ["validity"] }],
  ["narrower: fewer items", { type: "array", items: S, maxItems: 2 }, { type: "array", items: S }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["wider: an array without items admits any item", { type: "array" }, { type: "array", items: S }, "revision", { relation: "wider", aspects: ["validity"] }],
  ["narrower: narrower items", { type: "array", items: { type: "string", maxLength: 1 } }, { type: "array", items: S }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["narrower: narrower map values", { type: "object", values: { type: "integer" } }, { type: "object", values: { type: "number" } }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["narrower: an optional field made required", object({ a: S }), object({ a: S }, ["a"]), "revision", { relation: "narrower", aspects: ["validity"] }],
  // objects in revision mode are closed
  ["revision: an added optional field is wider", object({ a: S, b: S }, ["b"]), object({ a: S }), "revision", { relation: "wider", aspects: ["validity"] }],
  ["revision: an added required field is incomparable", object({ a: S, b: S }), object({ a: S }), "revision", { relation: "incomparable", aspects: ["validity"] }],
  ["revision: a removed optional field is narrower", object({ a: S }), object({ a: S, b: S }, ["b"]), "revision", { relation: "narrower", aspects: ["validity"] }],
  // extends mode compares on B's fields only
  ["extends: added fields of A are not compared", object({ a: S, b: S }), object({ a: S }), "extends", { relation: "same", aspects: [] }],
  ["extends: added fields of A are not compared at any depth", object({ o: object({ a: S, b: S }) }), object({ o: object({ a: S }) }), "extends", { relation: "same", aspects: [] }],
  ["extends: a narrowed field of B is narrower", object({ a: { type: "string", maxLength: 3 }, b: S }), object({ a: S }), "extends", { relation: "narrower", aspects: ["validity"] }],
  ["extends: a field of B that A lacks is not narrower", object({}), object({ a: S }), "extends", { relation: "incomparable", aspects: ["validity"] }],
  // aspects
  ["presentation: a changed description", { type: "string", description: "x" }, { type: "string", description: "y" }, "revision", { relation: "same", aspects: ["description"] }],
  ["presentation: a changed card_order", object({ a: { type: "string", card_order: 1 } }), object({ a: { type: "string", card_order: 2 } }), "revision", { relation: "same", aspects: ["card_order"] }],
  ["graph: a changed label is incomparable", REF({ label: "uses" }), REF({}), "revision", { relation: "incomparable", aspects: ["ref"] }],
  ["graph: an added ref is incomparable", REF({}), { type: "string", format: "ref" }, "revision", { relation: "incomparable", aspects: ["ref"] }],
  ["graph: a changed edge is incomparable", { type: "string", format: "uri", edge: "uses" }, { type: "string", format: "uri", edge: "about" }, "revision", { relation: "incomparable", aspects: ["edge"] }],
  ["graph: an added key is incomparable", object({ a: { type: "string", key: true } }), object({ a: S }), "revision", { relation: "incomparable", aspects: ["key"] }],
  ["graph: pinned is narrower than any", REF({ pin: "pinned" }), REF({ pin: "any" }), "revision", { relation: "narrower", aspects: ["ref"] }],
  ["graph: floating is narrower than any", REF({ pin: "floating" }), REF({ pin: "any" }), "revision", { relation: "narrower", aspects: ["ref"] }],
  ["graph: pinned and floating are incomparable", REF({ pin: "pinned" }), REF({ pin: "floating" }), "revision", { relation: "incomparable", aspects: ["ref"] }],
  ["graph: a subtype as ref.to is narrower", REF({ to: "demo/child@1" }), REF({ to: "demo/base@1" }), "revision", { relation: "narrower", aspects: ["ref"] }],
  ["graph: a ref.to the kernel does not admit reaches no parent — incomparable (Q-33)", REF({ to: "demo/oddchild@1" }), REF({ to: "demo/base@1" }), "revision", { relation: "incomparable", aspects: ["ref"] }],
  ["graph: an unrelated ref.to is incomparable", REF({ to: "demo/other@1" }), REF({ to: "demo/base@1" }), "revision", { relation: "incomparable", aspects: ["ref"] }],
  ["graph: added unique is narrower", object({ a: { type: "string", unique: true } }), object({ a: S }), "revision", { relation: "narrower", aspects: ["unique"] }],
  ["graph: removed unique is wider", object({ a: S }), object({ a: { type: "string", unique: true } }), "revision", { relation: "wider", aspects: ["unique"] }],
  ["aspects: an added field brings its annotations", object({ a: S, b: { type: "string", card_order: 1 } }, ["b"]), object({ a: S }), "revision", { relation: "wider", aspects: ["validity", "card_order"] }],
  ["aspects: an added required unique field brings unique", object({ a: S, b: { type: "string", unique: true } }), object({ a: S }), "revision", { relation: "incomparable", aspects: ["validity", "unique"] }],
  ["aspects: validity and presentation together", { type: "string", maxLength: 1, description: "x" }, S, "revision", { relation: "narrower", aspects: ["validity", "description"] }],
  // $ref through resolve
  ["$ref: the same reference is the same", { $ref: "demo/span@1" }, { $ref: "demo/span@1" }, "revision", { relation: "same", aspects: [] }],
  ["$ref: another revision with an equal schema is the same", { $ref: "demo/span@3" }, { $ref: "demo/span@1" }, "revision", { relation: "same", aspects: [] }],
  ["$ref: a narrower target is narrower", { $ref: "demo/span@2" }, { $ref: "demo/span@1" }, "revision", { relation: "narrower", aspects: ["validity"] }],
  ["$ref: a target and its schema inline are the same", object({ n: { type: "integer", maximum: 10 } }), { $ref: "demo/span@1" }, "revision", { relation: "same", aspects: [] }],
  ["$ref: an unknown target is incomparable", { $ref: "demo/none@1" }, { $ref: "demo/span@1" }, "revision", { relation: "incomparable", aspects: ["validity"] }],
  ["$ref: a recursive target compares by assumption", { $ref: "demo/tree@2" }, { $ref: "demo/tree@1" }, "revision", { relation: "same", aspects: [] }],
];

/** A tagged union of these branches, by `kind`. */
const union = (...branches: readonly (readonly [string, Schema])[]): Schema => ({
  oneOf: branches.map(([tag, rest]) => ({ type: "object", properties: { kind: { const: tag }, ...((rest.properties ?? {}) as object) }, required: ["kind"] })),
  discriminator: "kind",
});

const unions: readonly Row[] = [
  ["oneOf: an added branch is wider", union(["a", {}], ["b", {}]), union(["a", {}]), "revision", { relation: "wider", aspects: ["validity"] }],
  ["oneOf: a narrowed branch is narrower", union(["a", { properties: { n: { type: "integer" } } }]), union(["a", { properties: { n: { type: "number" } } }]), "revision", { relation: "narrower", aspects: ["validity"] }],
  ["oneOf: another discriminator is incomparable", { ...union(["a", {}]), discriminator: "tag" }, union(["a", {}]), "revision", { relation: "incomparable", aspects: ["validity"] }],
];

describe("compare (KR-22)", () => {
  for (const [name, a, b, mode, expected] of [...rows, ...unions]) {
    it(`KR-22: ${name}`, () => {
      expect(run(a, b, mode)).toEqual(expected);
    });
  }

  it("KR-22: the relation of B to A is the reverse of A to B in revision mode", () => {
    const flip = { same: "same", narrower: "wider", wider: "narrower", incomparable: "incomparable" } as const;
    for (const [, a, b] of [...rows, ...unions].filter((r) => r[3] === "revision")) {
      expect([a, b, run(b, a).relation]).toEqual([a, b, flip[run(a, b).relation]]);
    }
  });

  it("KR-22: a schema nested beyond what the walk follows is incomparable, never a crash", () => {
    const deep = (n: number, leaf: Schema): Schema => (n === 0 ? leaf : { type: "array", items: deep(n - 1, leaf) });
    expect(run(deep(5000, { type: "string", maxLength: 1 }), deep(5000, S)).relation).toBe("incomparable");
    expect(run(deep(5000, S), deep(5000, S)).relation).toBe("same");
  });

  it("KR-22: a $ref to a type the kernel does not admit names no schema — incomparable, never a crash (Q-33)", () => {
    expect(run({ $ref: "demo/odd@1" }, { $ref: "demo/span@1" })).toEqual({ relation: "incomparable", aspects: ["validity"] });
    expect(run({ $ref: "demo/span@1" }, { $ref: "demo/odd@1" })).toEqual({ relation: "incomparable", aspects: ["validity"] });
  });

  it("KR-22: a schema wider than the steps the walk takes is incomparable", () => {
    const wide = (n: number, field: Schema): Schema => object(Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, field])));
    const short: Schema = { type: "string", maxLength: 1 };
    expect(run(wide(1000, short), wide(1000, S)).relation).toBe("narrower");
    expect(run(wide(20_000, short), wide(20_000, S)).relation).toBe("incomparable");
  });
});
