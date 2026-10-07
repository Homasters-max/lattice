// One form of the outcome of a hard check (CONVENTIONS.md §2, §3, §5; LG-17):
// every hard check the kernel exports returns a Result — the value it checked,
// of its own type, or its rejections, sorted — and takes the place where its
// input sits, the intent too (G-13). `validate` keeps its own type (KR-21).
// Every input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import {
  checkAgainstType,
  checkFormat,
  checkHeader,
  checkId,
  checkSchema,
  checkUri,
  decodeUtf8,
  hashBytes,
  KR_06,
  KR_11,
  KR_24,
  parseJson,
  parseJsonBytes,
  reject,
  rejectionsOf,
  ROOT,
  sortRejections,
  type Record,
  type ResolveType,
  type Result,
} from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const PLACE = deepFreeze({ intent: "demo/a", path: "/records/0" });

const ENTITY: Record = deepFreeze({
  id: "demo/a",
  rev: 1,
  type: "demo/note@1",
  hash: "sha256:00",
  by: "01JB2X00000000000000000SES",
  at: "2026-10-06T12:00:00.000000Z",
  body: { text: "hi" },
});

const NOTE = deepFreeze({ type: "object", properties: { text: { type: "string" } }, required: ["text"] });

const TYPES: ResolveType = (ref) => (ref === "demo/note@1" ? { abstract: false, kind: "entity", schema: NOTE } : null);

/** A refused outcome's rejections are in the order of CONVENTIONS.md §5. */
const sorted = (r: Result<unknown>): boolean => !r.ok && JSON.stringify(r.rejections) === JSON.stringify(sortRejections(r.rejections));

describe("a hard check of the kernel returns a Result (CONVENTIONS.md §2, LG-17)", () => {
  it("LG-17: checkFormat, checkId and checkUri give the string they checked, or the rejection at the place given", () => {
    expect(checkFormat("date", "2026-10-06", PLACE)).toEqual({ ok: true, value: "2026-10-06" });
    expect(checkFormat("date", 5, PLACE)).toEqual({ ok: false, rejections: [reject(KR_11, { ...PLACE, expected: "date", got: 5 })] });
    expect(checkId("entity", "demo/a", PLACE)).toEqual({ ok: true, value: "demo/a" });
    expect(checkId("event", "demo/a", PLACE)).toEqual({ ok: false, rejections: [reject(KR_06, { ...PLACE, expected: "a ULID", got: "demo/a" })] });
    expect(checkUri("https://example.com", PLACE)).toEqual({ ok: true, value: "https://example.com" });
    expect(checkUri("example.com", PLACE)).toEqual({ ok: false, rejections: [reject(KR_24, { ...PLACE, expected: "an absolute URI", got: "example.com" })] });
  });

  it("LG-17: checkHeader gives the record it read, and takes a place — its rejections carry the intent", () => {
    expect(checkHeader(ENTITY, PLACE)).toEqual({ ok: true, value: ENTITY });
    const out = checkHeader(deepFreeze({ ...ENTITY, seq: 1 }), PLACE);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-04", "demo/a", "/records/0/seq"]]);
  });

  it("KR-04, KR-06, KR-07, KR-08: the rejections of checkHeader come sorted (CONVENTIONS.md §5) — its closed form and the grammar of its fields together", () => {
    const out = checkHeader(deepFreeze({ ...ENTITY, id: "Demo/A", type: "demo/note", by: "x", extra: 1 }), ROOT);
    expect(rejectionsOf(out).map((r) => [r.rule, r.path])).toEqual([
      ["KR-08", "/by"],
      ["KR-04", "/extra"],
      ["KR-06", "/id"],
      ["KR-07", "/type"],
    ]);
    expect(sorted(out)).toBe(true);
  });

  it("LG-17: checkSchema gives the schema it admitted", () => {
    expect(checkSchema(NOTE, "entity", ROOT)).toEqual({ ok: true, value: NOTE });
    const out = checkSchema(deepFreeze({ type: "object", properties: { B: { type: "string" }, a: { pattern: "x" } } }), "entity", PLACE);
    expect(out.ok).toBe(false);
    expect(sorted(out)).toBe(true);
    expect(rejectionsOf(out).every((r) => r.intent === "demo/a" && r.path.startsWith("/records/0/"))).toBe(true);
  });

  it("LG-17: checkAgainstType gives the record it was given", () => {
    const record = deepFreeze({ type: "demo/note@1", rev: 1, body: { text: "hi" } });
    expect(checkAgainstType(record, TYPES, PLACE)).toEqual({ ok: true, value: record });
    expect(rejectionsOf(checkAgainstType(deepFreeze({ ...record, body: {} }), TYPES, PLACE)).map((r) => [r.rule, r.intent, r.path])).toEqual([
      ["KR-21", "demo/a", "/records/0/body/text"],
    ]);
  });

  it("LG-17: rejectionsOf is empty for a Result that is ok", () => {
    expect(rejectionsOf(checkId("entity", "demo/a", ROOT))).toEqual([]);
  });
});

describe("the rejections of checkHeader carry the intent of its place (CONVENTIONS.md §3, G-13)", () => {
  it("LG-17: the rejections of the grammar of checkHeader's fields carry the intent of the place too", () => {
    const out = checkHeader(deepFreeze({ ...ENTITY, id: "Demo/A", type: "demo/note", by: "x", at: "2026-10-06" }), PLACE);
    expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path])).toEqual([
      ["KR-11", "demo/a", "/records/0/at"],
      ["KR-08", "demo/a", "/records/0/by"],
      ["KR-06", "demo/a", "/records/0/id"],
      ["KR-07", "demo/a", "/records/0/type"],
    ]);
  });
});

describe("the strict parse takes a place (CONVENTIONS.md §3, G-13)", () => {
  const AT = deepFreeze({ intent: "demo/a", path: "/body" });

  it("KR-10: parseJson refuses at the place given — the text as a whole and inside it, with its intent", () => {
    expect(rejectionsOf(parseJson("{", AT)).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-10", "demo/a", "/body"]]);
    expect(rejectionsOf(parseJson('{"a": -0}', AT)).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-10", "demo/a", "/body/a"]]);
    expect(parseJson("[1]", AT)).toEqual({ ok: true, value: [1] });
  });

  it("KR-10: parseJson refuses a key met twice and a string not in NFC inside the text, with the intent of the place", () => {
    const decomposed = "e\u0301"; // e and a combining accent: not in NFC
    expect(rejectionsOf(parseJson('{"a": 1, "a": 2}', AT)).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-10", "demo/a", "/body/a"]]);
    expect(rejectionsOf(parseJson(`{"b": "${decomposed}"}`, AT)).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-10", "demo/a", "/body/b"]]);
    expect(rejectionsOf(parseJson(`{"${decomposed}": 1}`, AT)).map((r) => [r.rule, r.intent, r.path])).toEqual([["KR-10", "demo/a", `/body/${decomposed}`]]);
  });

  it("KR-10: decodeUtf8 and parseJsonBytes refuse bytes that are not UTF-8 at the place given", () => {
    const bytes = Uint8Array.from([0x7b, 0xff, 0x7d]);
    for (const out of [decodeUtf8(bytes, AT), parseJsonBytes(bytes, AT)]) {
      expect(rejectionsOf(out).map((r) => [r.rule, r.intent, r.path, r.got])).toEqual([["KR-10", "demo/a", "/body", hashBytes(bytes)]]);
    }
  });
});
