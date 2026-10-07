// Types (KR-14…KR-17) and positions of the card along the `extends` chain
// (KR-19): the meta-type, the form of a type body, the chain of parents and
// abstract types. A record of type `core/type@1` is checked as a type body by
// phase 2 of one record (`checkAgainstType`), not by `validate`: a schema
// cannot be described by a schema of the subset (G-26); its refusals sit under
// `/body`. Every input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import {
  checkAgainstType,
  checkSchema,
  hashRecord,
  KR_14,
  KR_15,
  KR_16,
  KR_19,
  META_TYPE,
  reject,
  type JsonValue,
  type Place,
  type ResolveType,
} from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ROOT: Place = { intent: null, path: "" };

/** The type bodies a test knows by pinned reference, as phase 2 resolves them over `after`. */
const typesOf =
  (types: { readonly [ref: string]: JsonValue }): ResolveType =>
  (ref) =>
    Object.hasOwn(types, ref) ? (types[ref] ?? null) : null;

const NONE = typesOf({});

/** A type body as the record of a type, `core/type@1`, checked against the meta-type at the place given. */
const ofType = (body: JsonValue, resolve: ResolveType = NONE, place: Place = ROOT) =>
  checkAgainstType(deepFreeze({ type: "core/type@1", rev: 1, body }), resolve, deepFreeze(place));

const refusals = (body: JsonValue, resolve: ResolveType = NONE) => ofType(body, resolve).map((r) => [r.rule, r.path]);

const NOTE = { type: "object", properties: { text: { type: "string" } }, required: ["text"] } as const;

/** A type body of this kind and schema, abstract or not, with a parent when given. */
const type = (schema: JsonValue, more: { readonly [key: string]: JsonValue } = {}) => ({ abstract: false, kind: "entity", schema, ...more });

describe("the meta-type (KR-14)", () => {
  it("KR-14: core/type@1 is typed by itself and made by kernel code; by and at are the genesis session's (LG-47)", () => {
    expect(Object.keys(META_TYPE).sort()).toEqual(["body", "hash", "id", "rev", "type"]);
    expect(META_TYPE).toMatchObject({ id: "core/type", rev: 1, type: "core/type@1" });
    expect(Object.isFrozen(META_TYPE) && Object.isFrozen(META_TYPE.body)).toBe(true);
  });

  it("KR-14: its hash is a constant of the kernel version", () => {
    expect(META_TYPE.hash).toBe("sha256:3a1996b59660785be00156ceb2f78d0ee37da00974aa5b1fb5dddfb01c862349");
    const again = hashRecord(META_TYPE.type, META_TYPE.body);
    expect(again.ok && again.value).toBe(META_TYPE.hash);
  });

  it("KR-14: its body is a type body the check of a type body admits", () => {
    const { schema } = META_TYPE.body as { readonly schema: JsonValue };
    expect(refusals(META_TYPE.body)).toEqual([]);
    expect(checkSchema(schema, "entity", ROOT)).toEqual([]);
  });
});

describe("the body of a type (KR-14)", () => {
  it("KR-14: {extends, abstract, kind, schema}; extends absent means no parent", () => {
    expect(refusals(type(NOTE))).toEqual([]);
    expect(refusals(type(NOTE, { abstract: true, kind: "event" }))).toEqual([]);
  });

  it("KR-14: refuses a body out of form, member by member", () => {
    const broken: readonly (readonly [JsonValue, string])[] = [
      ["a type", "/body"],
      [{ kind: "entity", schema: NOTE }, "/body/abstract"],
      [type(NOTE, { abstract: "no" }), "/body/abstract"],
      [{ abstract: false, schema: NOTE }, "/body/kind"],
      [type(NOTE, { kind: "fact" }), "/body/kind"],
      [{ abstract: false, kind: "entity" }, "/body/schema"],
      [type(NOTE, { extends: null }), "/body/extends"],
      [type(NOTE, { extends: "demo/base" }), "/body/extends"],
      [type(NOTE, { extends: "demo/base@1#a" }), "/body/extends"],
      [type(NOTE, { title: "note" }), "/body/title"],
    ];
    for (const [body, path] of broken) expect([body, refusals(body)]).toEqual([body, [["KR-14", path]]]);
  });

  it("KR-14: refuses with what the member wants, at the caller's place", () => {
    expect(ofType(type(NOTE, { kind: "fact" }), NONE, { intent: "demo/note", path: "" })).toEqual([
      reject(KR_14, { intent: "demo/note", path: "/body/kind", expected: ["entity", "event"], got: "fact" }),
    ]);
  });

  it("KR-18: the schema is one of the closed subset, checked for the type's kind", () => {
    expect(refusals(type({ type: "object", properties: { at: { type: "string", pattern: "x" } } }))).toEqual([["KR-18", "/body/schema/properties/at/pattern"]]);
    const keyed = { type: "object", properties: { of: { type: "string", key: true } }, required: ["of"] };
    expect(refusals(type(keyed))).toEqual([["KR-19", "/body/schema/properties/of/key"]]);
    expect(refusals(type(keyed, { kind: "event" }))).toEqual([]);
  });

  it("KR-17: several parents are no form of extends — one field, one pinned parent", () => {
    expect(refusals(type(NOTE, { extends: ["demo/a@1", "demo/b@1"] }))).toEqual([["KR-14", "/body/extends"]]);
  });
});

describe("the chain of extends (KR-15)", () => {
  const base = type(NOTE, { abstract: true });

  it("KR-15: a child narrows or keeps every field of its parent and may add fields", () => {
    const child = type({ ...NOTE, properties: { text: { type: "string", maxLength: 10 }, more: { type: "integer" } } }, { extends: "demo/base@1" });
    expect(refusals(child, typesOf({ "demo/base@1": base }))).toEqual([]);
  });

  it("KR-15: refuses a child that loosens a field of its parent", () => {
    const child = type({ ...NOTE, properties: { text: { type: ["string", "null"] } } }, { extends: "demo/base@1" });
    expect(ofType(child, typesOf({ "demo/base@1": base }))).toEqual([
      reject(KR_15, { intent: null, path: "/body/schema", expected: ["narrower", "same"], got: "wider" }),
    ]);
  });

  it("KR-15: refuses a child that drops a required field of its parent", () => {
    const child = type({ type: "object", properties: {} }, { extends: "demo/base@1" });
    expect(refusals(child, typesOf({ "demo/base@1": base }))).toEqual([["KR-15", "/body/schema"]]);
  });

  it("KR-15: kind never changes along the chain", () => {
    const child = type(NOTE, { extends: "demo/base@1", kind: "event" });
    expect(ofType(child, typesOf({ "demo/base@1": base }))).toEqual([
      reject(KR_15, { intent: null, path: "/body/kind", expected: "entity", got: "event" }),
    ]);
  });

  it("KR-15: no cycle, inside one commit too — the parents resolve over after", () => {
    const types = typesOf({ "demo/a@1": type(NOTE, { extends: "demo/b@1" }), "demo/b@1": type(NOTE, { extends: "demo/a@1" }) });
    expect(ofType(type(NOTE, { extends: "demo/a@1" }), types)).toEqual([
      reject(KR_15, { intent: null, path: "/body/extends", expected: "a chain of parents without a cycle", got: ["demo/a@1", "demo/b@1", "demo/a@1"] }),
    ]);
  });

  it("KR-15: at most 4 deep — four parents pass, a fifth is refused", () => {
    const chain = (n: number) =>
      typesOf(Object.fromEntries(Array.from({ length: n }, (_, i) => [`demo/t${i + 1}@1`, i + 1 < n ? type(NOTE, { extends: `demo/t${i + 2}@1` }) : type(NOTE)])));
    expect(refusals(type(NOTE, { extends: "demo/t1@1" }), chain(4))).toEqual([]);
    expect(ofType(type(NOTE, { extends: "demo/t1@1" }), chain(5))).toEqual([
      reject(KR_15, { intent: null, path: "/body/extends", expected: "at most 4 parents", got: ["demo/t1@1", "demo/t2@1", "demo/t3@1", "demo/t4@1", "demo/t5@1"] }),
    ]);
  });

  it("KR-15: refuses a parent the caller does not know as a type", () => {
    expect(ofType(type(NOTE, { extends: "demo/base@1" }), NONE)).toEqual([
      reject(KR_15, { intent: null, path: "/body/extends", expected: "a type resolve knows", got: "demo/base@1" }),
    ]);
    expect(refusals(type(NOTE, { extends: "demo/base@1" }), typesOf({ "demo/base@1": { kind: "entity" } }))).toEqual([["KR-15", "/body/extends"]]);
  });

  it("KR-15: refuses a known parent whose own parent the caller does not know — the chain cannot be shown", () => {
    const types = typesOf({ "demo/base@1": type(NOTE, { abstract: true, extends: "demo/grand@1" }) });
    expect(ofType(type(NOTE, { extends: "demo/base@1" }), types)).toEqual([
      reject(KR_15, { intent: null, path: "/body/extends", expected: "a type resolve knows", got: "demo/grand@1" }),
    ]);
  });
});

describe("positions of the card along the chain (KR-19)", () => {
  const card = (order: number, name = "text") => ({ type: "object", properties: { [name]: { type: "string", card_order: order } }, required: [name] });

  it("KR-19: one position, one field along the chain; a child may keep the position of a field it inherits", () => {
    const parent = type(card(1), { abstract: true });
    const child = type({ ...card(1), properties: { text: { type: "string", card_order: 1 }, more: { type: "string", card_order: 2 } } }, { extends: "demo/base@1" });
    expect(refusals(child, typesOf({ "demo/base@1": parent }))).toEqual([]);
  });

  it("KR-19: refuses a position a field of a parent holds", () => {
    const grand = type(card(1), { abstract: true });
    const parent = type({ ...card(1), properties: { text: { type: "string", card_order: 1 } } }, { abstract: true, extends: "demo/grand@1" });
    const child = type({ ...card(1), properties: { text: { type: "string", card_order: 1 }, more: { type: "string", card_order: 1 } } }, { extends: "demo/base@1" });
    expect(ofType(child, typesOf({ "demo/base@1": parent, "demo/grand@1": grand }))).toEqual([
      reject(KR_19, { intent: null, path: "/body/schema/properties/more/card_order", expected: "a position no other field holds along the extends chain", got: 1 }),
    ]);
  });

  it("KR-19: refuses a position a field of a farther parent holds, though the nearer parent dropped it", () => {
    const grand = type(card(1), { abstract: true });
    const parent = type(NOTE, { abstract: true, extends: "demo/grand@1" });
    const child = type({ ...NOTE, properties: { text: { type: "string" }, more: { type: "string", card_order: 1 } } }, { extends: "demo/base@1" });
    expect(ofType(child, typesOf({ "demo/base@1": parent, "demo/grand@1": grand }))).toEqual([
      reject(KR_19, { intent: null, path: "/body/schema/properties/more/card_order", expected: "a position no other field holds along the extends chain", got: 1 }),
    ]);
  });

  it("KR-19: refuses two fields of one type at one position", () => {
    const twice = { type: "object", properties: { a: { type: "string", card_order: 1 }, b: { type: "string", card_order: 1 } } };
    expect(refusals(type(twice))).toEqual([["KR-19", "/body/schema/properties/b/card_order"]]);
  });
});

describe("abstract types (KR-16)", () => {
  const shape = (abstract: boolean) => type({ type: "object", properties: { at: { type: "string" } } }, { abstract });
  const holder = type({ type: "object", properties: { period: { $ref: "demo/period@1" } } });

  it("KR-16: $ref names an abstract type", () => {
    expect(refusals(holder, typesOf({ "demo/period@1": shape(true) }))).toEqual([]);
  });

  it("KR-16: refuses a $ref to a type that is not abstract, or that the caller does not know", () => {
    expect(ofType(holder, typesOf({ "demo/period@1": shape(false) }))).toEqual([
      reject(KR_16, { intent: null, path: "/body/schema/properties/period/$ref", expected: "an abstract type", got: "demo/period@1" }),
    ]);
    expect(ofType(holder)).toEqual([
      reject(KR_16, { intent: null, path: "/body/schema/properties/period/$ref", expected: "an abstract type resolve knows", got: "demo/period@1" }),
    ]);
  });

  it("KR-16: an abstract type has no records", () => {
    const place = deepFreeze({ intent: "demo/hello", path: "" });
    const record = deepFreeze({ type: "demo/period@1", rev: 1, body: { at: "a" } });
    expect(checkAgainstType(record, typesOf({ "demo/period@1": shape(false) }), place)).toEqual([]);
    expect(checkAgainstType(record, typesOf({ "demo/period@1": shape(true) }), place)).toEqual([
      reject(KR_16, { intent: "demo/hello", path: "/type", expected: "a type that is not abstract", got: "an abstract type" }),
    ]);
  });
});
