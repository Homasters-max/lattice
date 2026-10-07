// Phase 2 of one record (LG-16): the record against its type — `rev` by the
// kind of the type (KR-04, KR-05), no record of an abstract type (KR-16), a
// type body by the meta-type with its chain of `extends` (KR-14, KR-15,
// KR-22) and any other body against the schema of its type (KR-21). One
// resolver gives type bodies by pinned reference; the kernel reads the schema
// out of the body itself and admits no type it has not checked (Q-33). Every
// input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import { checkAgainstType, KR_04, KR_15, KR_16, KR_21, reject, type JsonValue, type Place, type ResolveType } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ROOT: Place = { intent: null, path: "" };

/** The type bodies a test knows by pinned reference, as phase 2 resolves them over `after`. */
const typesOf =
  (types: { readonly [ref: string]: JsonValue }): ResolveType =>
  (ref) =>
    Object.hasOwn(types, ref) ? (types[ref] ?? null) : null;

const NOTE = { type: "object", properties: { text: { type: "string", maxLength: 5 } }, required: ["text"] } as const;

const type = (more: { readonly [key: string]: JsonValue } = {}) => ({ abstract: false, kind: "entity", schema: NOTE, ...more });

const TYPES = typesOf({
  "demo/note@1": type(),
  "demo/seen@1": type({ kind: "event" }),
  "demo/shape@1": type({ abstract: true }),
});

const check = (record: { readonly type: string; readonly rev?: number; readonly body: JsonValue }, resolve: ResolveType = TYPES, place = ROOT) =>
  checkAgainstType(deepFreeze(record), resolve, deepFreeze(place));

const refusals = (record: Parameters<typeof check>[0], resolve?: ResolveType) => check(record, resolve).map((r) => [r.rule, r.path]);

describe("rev by the kind of the type (KR-04, KR-05)", () => {
  it("KR-04: takes an entity with rev and an event without", () => {
    expect([refusals({ type: "demo/note@1", rev: 1, body: { text: "a" } }), refusals({ type: "demo/seen@1", body: { text: "a" } })]).toEqual([[], []]);
  });

  it("KR-04, KR-05: refuses an entity without rev and an event with rev, at the place the caller names", () => {
    const place = { intent: "demo/a", path: "" };
    expect(check({ type: "demo/note@1", body: { text: "a" } }, TYPES, place)).toEqual([reject(KR_04, { ...place, path: "/rev", expected: "a revision", got: "absent" })]);
    expect(check({ type: "demo/seen@1", rev: 1, body: { text: "a" } }, TYPES, place)).toEqual([reject(KR_04, { ...place, path: "/rev", expected: "absent", got: 1 })]);
  });
});

describe("no record of an abstract type (KR-16)", () => {
  it("KR-16: refuses a record of an abstract type at /type", () => {
    expect(check({ type: "demo/shape@1", rev: 1, body: { text: "a" } })).toEqual([
      reject(KR_16, { intent: null, path: "/type", expected: "a type that is not abstract", got: "an abstract type" }),
    ]);
  });
});

describe("the body against the schema of its type (KR-21)", () => {
  it("KR-21: refuses each violation of the body at its path under /body, the keyword in expected", () => {
    expect(check({ type: "demo/note@1", rev: 1, body: { text: "abcdef" } }, TYPES, { intent: "demo/a", path: "" })).toEqual([
      reject(KR_21, { intent: "demo/a", path: "/body/text", expected: { maxLength: 5 }, got: 6 }),
    ]);
  });

  it("KR-21: a $ref of the schema is read out of the body of its abstract type", () => {
    const holder = type({ schema: { type: "object", properties: { at: { $ref: "demo/shape@1" } }, required: ["at"] } });
    const resolve = typesOf({ "demo/holder@1": holder, "demo/shape@1": type({ abstract: true }) });
    expect(refusals({ type: "demo/holder@1", rev: 1, body: { at: { text: "a" } } }, resolve)).toEqual([]);
    expect(refusals({ type: "demo/holder@1", rev: 1, body: { at: { text: 1 } } }, resolve)).toEqual([["KR-21", "/body/at/text"]]);
  });

  it("KR-21: a $ref to a type the kernel does not admit is a violation, not an exception (Q-33)", () => {
    const holder = type({ schema: { type: "object", properties: { at: { $ref: "demo/shape@1" } }, required: ["at"] } });
    const broken = { abstract: true, kind: "entity", schema: { type: "array", items: 5 } };
    const resolve = typesOf({ "demo/holder@1": holder, "demo/shape@1": broken });
    expect(refusals({ type: "demo/holder@1", rev: 1, body: { at: [1] } }, resolve)).toEqual([["KR-21", "/body/at"]]);
  });
});

describe("the type of the record (KR-15, Q-33)", () => {
  it("KR-15: refuses a type the caller does not know, at /type", () => {
    expect(check({ type: "demo/gone@1", rev: 1, body: {} })).toEqual([reject(KR_15, { intent: null, path: "/type", expected: "a type resolve knows", got: "demo/gone@1" })]);
  });

  it("KR-15: refuses a type whose body is no type or whose schema checkSchema does not admit — a refusal, not an exception", () => {
    const resolve = typesOf({ "demo/odd@1": { kind: "entity" }, "demo/bad@1": type({ schema: { type: "array", const: [1], items: 5 } }) });
    for (const ref of ["demo/odd@1", "demo/bad@1"]) {
      expect(check({ type: ref, rev: 1, body: [1] }, resolve)).toEqual([reject(KR_15, { intent: null, path: "/type", expected: "an admitted type", got: ref })]);
    }
  });
});

describe("a type body by the meta-type (KR-14, KR-15, KR-22)", () => {
  const record = (body: JsonValue) => ({ type: "core/type@1", rev: 1, body });
  const base = type({ abstract: true });

  it("KR-14: a record of core/type@1 is read by the check of a type body, its refusals under /body", () => {
    expect(refusals(record(type()))).toEqual([]);
    expect(refusals(record(type({ kind: "fact" })))).toEqual([["KR-14", "/body/kind"]]);
    expect(refusals({ type: "core/type@1", body: type() })).toEqual([["KR-04", "/rev"]]);
  });

  it("KR-15, KR-22: a child narrows its parent along the chain of extends", () => {
    const child = type({ extends: "demo/base@1", schema: { ...NOTE, properties: { text: { type: "string", maxLength: 3 } } } });
    const wider = type({ extends: "demo/base@1", schema: { ...NOTE, properties: { text: { type: "string" } } } });
    expect(refusals(record(child), typesOf({ "demo/base@1": base }))).toEqual([]);
    expect(check(record(wider), typesOf({ "demo/base@1": base }))).toEqual([
      reject(KR_15, { intent: null, path: "/body/schema", expected: ["narrower", "same"], got: "wider" }),
    ]);
  });

  it("KR-15: refuses a parent whose schema checkSchema does not admit at /body/extends — no bug: (Q-33)", () => {
    const parent = { abstract: true, kind: "entity", schema: { type: "array", const: [1], items: 5 } };
    const child = type({ extends: "demo/base@1", schema: { type: "array", items: { type: "integer" } } });
    expect(() => check(record(child), typesOf({ "demo/base@1": parent }))).not.toThrow();
    expect(check(record(child), typesOf({ "demo/base@1": parent }))).toContainEqual(
      reject(KR_15, { intent: null, path: "/body/extends", expected: "an admitted type", got: "demo/base@1" }),
    );
  });

  it("KR-15: refuses a farther parent the kernel does not admit, though the nearer one is", () => {
    const grand = { abstract: true, kind: "entity", schema: { type: "object", properties: { text: { type: "string", pattern: "x" } } } };
    const parent = type({ abstract: true, extends: "demo/grand@1" });
    const resolve = typesOf({ "demo/base@1": parent, "demo/grand@1": grand });
    expect(check(record(type({ extends: "demo/base@1" })), resolve)).toEqual([
      reject(KR_15, { intent: null, path: "/body/extends", expected: "an admitted type", got: "demo/grand@1" }),
    ]);
  });

  it("KR-16: a $ref of a type body names an abstract type the kernel admits", () => {
    const holder = type({ schema: { type: "object", properties: { at: { $ref: "demo/shape@1" } }, required: ["at"] } });
    const broken = { abstract: true, kind: "entity", schema: { type: "object", properties: { at: { type: "string", pattern: "x" } } } };
    expect(refusals(record(holder), typesOf({ "demo/shape@1": base }))).toEqual([]);
    expect(check(record(holder), typesOf({ "demo/shape@1": broken }))).toEqual([
      reject(KR_16, { intent: null, path: "/body/schema/properties/at/$ref", expected: "an admitted abstract type", got: "demo/shape@1" }),
    ]);
  });

  it("KR-14: the kernel reads core/type@1 from its META_TYPE, not from resolve", () => {
    const other = { abstract: true, kind: "event", schema: { type: "object", properties: {} } };
    expect(check(record(type()), typesOf({ "core/type@1": other }))).toEqual([]);
    expect(check(record(type({ kind: "fact" })), typesOf({ "core/type@1": other })).map((r) => [r.rule, r.path])).toEqual([["KR-14", "/body/kind"]]);
  });
});

describe("the place of the record (LG-16, CONVENTIONS.md §5)", () => {
  const record = { type: "demo/shape@1", body: { text: "abcdef" } };

  it("LG-16: refusals from rev, the type and the body come sorted by path", () => {
    expect(check(record)).toEqual([
      reject(KR_21, { intent: null, path: "/body/text", expected: { maxLength: 5 }, got: 6 }),
      reject(KR_04, { intent: null, path: "/rev", expected: "a revision", got: "absent" }),
      reject(KR_16, { intent: null, path: "/type", expected: "a type that is not abstract", got: "an abstract type" }),
    ]);
  });

  it("LG-16: refusals sit under the place the caller names — /rev, /type and /body of the record there", () => {
    const place = { intent: "demo/a", path: "/records/0" };
    expect(check(record, TYPES, place)).toEqual([
      reject(KR_21, { ...place, path: "/records/0/body/text", expected: { maxLength: 5 }, got: 6 }),
      reject(KR_04, { ...place, path: "/records/0/rev", expected: "a revision", got: "absent" }),
      reject(KR_16, { ...place, path: "/records/0/type", expected: "a type that is not abstract", got: "an abstract type" }),
    ]);
    expect(check({ type: "demo/gone@1", rev: 1, body: {} }, TYPES, place)).toEqual([
      reject(KR_15, { ...place, path: "/records/0/type", expected: "a type resolve knows", got: "demo/gone@1" }),
    ]);
    expect(check({ type: "core/type@1", rev: 1, body: type({ kind: "fact" }) }, TYPES, place).map((r) => r.path)).toEqual(["/records/0/body/kind"]);
  });
});
