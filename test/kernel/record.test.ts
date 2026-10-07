// The header of a record (KR-04…KR-09, PR-01): exactly the fields of KR-04,
// `rev` against the kind of the type when the caller knows it (KR-05), the
// grammar of `id` (KR-06), a pinned `type` read by the one reference parser
// (KR-07, PR-01), `by` a ULID and `at` a canonical date-time that the kernel
// gives no meaning (KR-08, KR-09, KR-11). Every input crosses the module
// boundary frozen.
import { describe, expect, it } from "vitest";
import { checkHeader, KR_04, KR_06, KR_07, KR_08, KR_11, reject, type JsonObject, type JsonValue } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ENTITY: JsonObject = deepFreeze({
  id: "demo/a",
  rev: 1,
  type: "demo/note@1",
  hash: "sha256:00",
  by: "01JB2X00000000000000000SES",
  at: "2026-10-06T12:00:00.000000Z",
  body: {},
});

const { rev: _rev, ...eventFields } = ENTITY;
const EVENT: JsonObject = deepFreeze({ ...eventFields, id: "01JB2X00000000000000000EVT", type: "demo/seen@1" });

const at = (path: string) => ({ intent: null, path });

/** The header with one field changed; `undefined` removes it. */
function changed(record: JsonObject, name: string, value: JsonValue | undefined): JsonObject {
  const { [name]: _old, ...rest } = record;
  return deepFreeze(value === undefined ? rest : { ...rest, [name]: value });
}

describe("the header of a record (KR-04, KR-05)", () => {
  it("KR-04: takes an entity with rev and an event without, the kind known or not", () => {
    expect([checkHeader(ENTITY, "/0"), checkHeader(ENTITY, "/0", "entity"), checkHeader(EVENT, "/1"), checkHeader(EVENT, "/1", "event")]).toEqual([[], [], [], []]);
  });

  it("KR-04: refuses a field outside the header, with the value that came", () => {
    expect(checkHeader(changed(ENTITY, "seq", 3), "/0")).toEqual([reject(KR_04, { ...at("/0/seq"), expected: "absent", got: 3 })]);
  });

  it("KR-05: refuses kind as a header field — the kind of a record is its type's, never the header's", () => {
    expect(checkHeader(changed(ENTITY, "kind", "entity"), "/0").map((r) => [r.rule, r.path])).toEqual([["KR-04", "/0/kind"]]);
  });

  it("KR-04: refuses every absent field at its path", () => {
    for (const name of ["id", "type", "hash", "by", "at", "body"]) {
      expect(checkHeader(changed(ENTITY, name, undefined), "/0").map((r) => [r.rule, r.path, r.got])).toEqual([["KR-04", `/0/${name}`, "absent"]]);
    }
  });

  it("KR-04: rev is a revision — an integer from 1 — or absent", () => {
    for (const rev of [0, -1, 1.5, 9007199254740992, "1", null]) {
      expect([rev, checkHeader(changed(ENTITY, "rev", rev), "/0").map((r) => [r.rule, r.path])]).toEqual([rev, [["KR-04", "/0/rev"]]]);
    }
  });

  it("KR-04, KR-05: checks rev against the kind of the type the caller gives", () => {
    expect(checkHeader(ENTITY, "/0", "event")).toEqual([reject(KR_04, { ...at("/0/rev"), expected: "absent", got: 1 })]);
    expect(checkHeader(changed(ENTITY, "rev", undefined), "/0", "entity")).toEqual([reject(KR_04, { ...at("/0/rev"), expected: "a revision", got: "absent" })]);
  });

  it("KR-04: refuses a record that is no object", () => {
    expect(checkHeader(null, "/0")).toEqual([reject(KR_04, { ...at("/0"), expected: "a record", got: null })]);
  });
});

describe("the id of a record (KR-06)", () => {
  it("KR-06: an entity id is namespace/slug and an event id a ULID — rev tells which when the kind is not given", () => {
    expect(checkHeader(changed(ENTITY, "id", "Demo/A"), "/0")).toEqual([reject(KR_06, { ...at("/0/id"), expected: "namespace/slug", got: "Demo/A" })]);
    expect(checkHeader(changed(EVENT, "id", "demo/a"), "/0")).toEqual([reject(KR_06, { ...at("/0/id"), expected: "a ULID", got: "demo/a" })]);
    expect(checkHeader(changed(EVENT, "id", "demo/a"), "/0", "event").map((r) => r.rule)).toEqual(["KR-06"]);
  });
});

describe("the type of a record (KR-07, PR-01)", () => {
  it("KR-07: refuses a floating type, an event, a fragment and a string outside the reference grammar", () => {
    for (const type of ["demo/note", "01JB2X00000000000000000TYP", "demo/note@1#schema", "demo/note@x"]) {
      expect(checkHeader(changed(ENTITY, "type", type), "/0")).toEqual([reject(KR_07, { ...at("/0/type"), expected: "type@n", got: type })]);
    }
  });
});

describe("author and author time (KR-08, KR-09)", () => {
  it("KR-08: by is a ULID", () => {
    for (const by of ["demo/session", "01jb2x00000000000000000ses", ""]) {
      expect(checkHeader(changed(ENTITY, "by", by), "/0")).toEqual([reject(KR_08, { ...at("/0/by"), expected: "a ULID", got: by })]);
    }
  });

  it("KR-08, KR-11: at is a date-time in its canonical spelling", () => {
    expect(checkHeader(changed(ENTITY, "at", "2026-10-06T12:00:00Z"), "/0")).toEqual([reject(KR_11, { ...at("/0/at"), expected: "date-time", got: "2026-10-06T12:00:00Z" })]);
  });

  it("KR-09: gives at no meaning — any canonical date-time is the author's, earlier or later than anything", () => {
    for (const time of ["0000-01-01T00:00:00.000000Z", "9999-12-31T23:59:59.999999Z"]) expect(checkHeader(changed(EVENT, "at", time), "/0")).toEqual([]);
  });
});
