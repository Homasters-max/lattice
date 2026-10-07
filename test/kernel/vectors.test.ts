// The frozen hash test vectors (KR-13): RFC 8785 Appendix B and the examples of
// its sections 3.2.2 and 3.2.3, the NFC cases and the formats of KR-11. They
// never change between kernel versions, so each file is pinned by its hash: a
// change of a vector fails here before anything else.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canon, isFormat, parseJson, type Format, type JsonValue } from "../../src/kernel/index.js";
import { serialize } from "../../src/kernel/json.js";

const dir = join(import.meta.dirname, "..", "vectors");
const bytes = (file: string) => readFileSync(join(dir, file));
const vector = <T>(file: string): T => JSON.parse(bytes(file).toString("utf8")) as T;

const PINNED: { readonly [file: string]: string } = {
  "rfc8785-numbers.json": "714da647d458c6251dfb0ca015eaeaea7d14edfc8e6b45d06102619339b6971e",
  "rfc8785-examples.json": "817f29fb04e092c6a39f61443978792519d5d68d969b652903f5f90cd06b1857",
  "nfc.json": "b59c6efa2ffddcb20b12724afee08aa937dbd23ab1398dc03dec32df0f49c6b6",
  "formats.json": "8a2911d7ce6cdd6aac2d184047ea0e10ba0322ff6d61f7ca8b5ececec5b671be",
};

type NumberVector = { readonly ieee: string; readonly json: string | null; readonly comment: string; readonly admitted: boolean };
type Example = { readonly section: string; readonly input: string; readonly output: string; readonly refused: string };
type NfcCase = { readonly text: string; readonly nfc: boolean; readonly note: string };
type Spellings = { readonly valid: readonly string[]; readonly invalid: readonly string[] };

const numberOf = (ieee: string): number => Buffer.from(ieee, "hex").readDoubleBE(0);

describe("the vector files (KR-13)", () => {
  it("KR-13: every vector file is pinned by its hash, and nothing else lies beside them", () => {
    const actual = Object.fromEntries(Object.keys(PINNED).map((f) => [f, createHash("sha256").update(bytes(f)).digest("hex")]));
    expect(actual).toEqual(PINNED);
    expect(readdirSync(dir).sort()).toEqual(Object.keys(PINNED).sort());
  });
});

describe("RFC 8785 Appendix B (KR-10, KR-12)", () => {
  const { numbers } = vector<{ numbers: readonly NumberVector[] }>("rfc8785-numbers.json");

  it("KR-12: writes every finite number of Appendix B as RFC 8785 does", () => {
    for (const v of numbers.filter((n) => n.json !== null)) expect([v.ieee, serialize(numberOf(v.ieee))]).toEqual([v.ieee, v.json]);
  });

  it("KR-10: canon takes the numbers it admits in the same spelling and refuses -0, NaN, Infinity and integers outside ±(2^53−1) (G-20)", () => {
    for (const v of numbers) {
      const result = canon(numberOf(v.ieee));
      expect([v.ieee, result]).toEqual([v.ieee, v.admitted ? { ok: true, value: v.json } : expect.objectContaining({ ok: false })]);
      if (!result.ok) expect(result.rejections.map((r) => [r.rule, r.path])).toEqual([["KR-10", ""]]);
    }
  });

  it("KR-10: the boundary of G-20 is the last safe integer", () => {
    expect(canon(9007199254740991)).toEqual({ ok: true, value: "9007199254740991" });
    expect(canon(-9007199254740991)).toEqual({ ok: true, value: "-9007199254740991" });
    expect(canon(9007199254740992).ok).toBe(false);
  });
});

describe("RFC 8785 examples of sections 3.2.2 and 3.2.3 (KR-10, KR-12)", () => {
  const { examples } = vector<{ examples: readonly Example[] }>("rfc8785-examples.json");

  it("KR-12: writes each example as RFC 8785 does, keys sorted by UTF-16 code units", () => {
    // The examples hold what KR-10 refuses, so the plain platform parse gives their values here.
    for (const e of examples) expect([e.section, serialize(JSON.parse(e.input) as JsonValue)]).toEqual([e.section, e.output]);
  });

  it("KR-10: the strict parse refuses each example where it leaves I-JSON in NFC", () => {
    for (const e of examples) {
      const parsed = parseJson(e.input);
      expect([e.section, parsed.ok ? [] : parsed.rejections.map((r) => [r.rule, r.path])]).toEqual([e.section, [["KR-10", e.refused]]]);
    }
  });
});

describe("NFC cases (KR-10)", () => {
  const { cases } = vector<{ cases: readonly NfcCase[] }>("nfc.json");

  it("KR-10: canon and the parse take a string in NFC and refuse one that is not", () => {
    for (const c of cases) {
      const text = serialize({ s: c.text });
      expect([c.note, canon({ s: c.text }).ok, parseJson(text).ok]).toEqual([c.note, c.nfc, c.nfc]);
    }
  });
});

describe("formats (KR-11)", () => {
  const formats = vector<{ readonly [format in Format]: Spellings }>("formats.json");

  it("KR-11: takes every canonical spelling and refuses every other", () => {
    for (const format of ["date-time", "date", "decimal", "ulid"] as const) {
      for (const s of formats[format].valid) expect([format, s, isFormat(format, s)]).toEqual([format, s, true]);
      for (const s of formats[format].invalid) expect([format, s, isFormat(format, s)]).toEqual([format, s, false]);
    }
  });
});
