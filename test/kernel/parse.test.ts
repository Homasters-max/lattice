// The strict parse (KR-10, D-04): JSON text per RFC 8259, I-JSON, every string
// in NFC; refused, never repaired. A refusal of the text as a whole sits at
// the path given; a refusal inside the value at its JSON Pointer under it.
import { describe, expect, it } from "vitest";
import { parseJson, parseJsonBytes } from "../../src/kernel/index.js";

const where = (r: ReturnType<typeof parseJson>) => (r.ok ? [] : r.rejections.map((x) => [x.rule, x.path, x.expected, x.got]));

describe("the strict parse (KR-10)", () => {
  it("KR-10: reads the grammar of RFC 8259 into frozen values", () => {
    const parsed = parseJson(' \t\r\n{"a" : [1, -2.5e-3, 0, true, false, null, "x\\u00e9\\n\\/\\"", {}, []], "b": {"c": "d"}} \n');
    expect(parsed).toEqual({ ok: true, value: { a: [1, -0.0025, 0, true, false, null, "x\u00E9\n/\"", {}, []], b: { c: "d" } } });
    expect(parsed.ok && Object.isFrozen(parsed.value) && Object.isFrozen((parsed.value as { a: unknown }).a)).toBe(true);
    for (const text of ["0", "\"\"", "null", "-1.5E+2", "[]"]) expect([text, parseJson(text).ok]).toEqual([text, true]);
  });

  it("KR-10: keeps __proto__ as a key, not as a prototype", () => {
    const parsed = parseJson('{"__proto__": {"x": 1}}');
    expect(parsed.ok && Object.getPrototypeOf(parsed.value)).toBe(Object.prototype);
    expect(parsed.ok && Object.keys(parsed.value as object)).toEqual(["__proto__"]);
  });

  it("KR-10: refuses a text that is not JSON as a whole, at the path given", () => {
    const texts = ["", " ", "{", "[1,]", '{"a":1,}', "01", "1.", ".5", "+1", "-", "1e", "NaN", "Infinity", "'a'", '{a:1}', '"a', '"\t"', '"\\x"', '"\\u12"', "[1 2]", '{"a" 1}', "true false", "\uFEFF{}", "nul", "[1]]", "{}}"];
    for (const text of texts) expect([text, where(parseJson(text, { intent: null, path: "/f" }))]).toEqual([text, [["KR-10", "/f", "a JSON text", text]]]);
  });

});

describe("the strict parse refuses inside the value (KR-10)", () => {
  it("KR-10: refuses a duplicate key at the member, never keeping one of them", () => {
    expect(where(parseJson('{"a": 1, "b": {"c": 1, "c": 2}, "a": 3}', { intent: null, path: "/f" }))).toEqual([
      ["KR-10", "/f/a", "a key once", "a"],
      ["KR-10", "/f/b/c", "a key once", "c"],
    ]);
  });

  it("KR-10: refuses -0, a number out of range and an integer outside ±(2^53−1), naming the number as written (G-20)", () => {
    expect(where(parseJson('[-0, -0.0, -0e3, 1e400, 9007199254740992, -9007199254740993, 1E30, 9007199254740991, 0.5, -1e-400]'))).toEqual([
      ["KR-10", "/0", "a number other than -0", "-0"],
      ["KR-10", "/1", "a number other than -0", "-0.0"],
      ["KR-10", "/2", "a number other than -0", "-0e3"],
      ["KR-10", "/3", "a finite number", "1e400"],
      ["KR-10", "/4", "an integer within ±(2^53−1)", "9007199254740992"],
      ["KR-10", "/5", "an integer within ±(2^53−1)", "-9007199254740993"],
      ["KR-10", "/6", "an integer within ±(2^53−1)", "1E30"],
      ["KR-10", "/9", "a number other than -0", "-1e-400"],
    ]);
  });

  it("KR-10: refuses a string or a key not in NFC, a lone surrogate, escaped or raw, and a noncharacter", () => {
    const text = '{"e\u0301": "x", "s": ["\\ud800", "\uDC00", "\\ud83d\\ude00", "e\\u0301", "\\uffff"]}';
    expect(where(parseJson(text))).toEqual([
      ["KR-10", "/e\u0301", "a string in NFC", "e\u0301"],
      ["KR-10", "/s/0", "Unicode scalar values, no lone surrogate", "\uD800"],
      ["KR-10", "/s/1", "Unicode scalar values, no lone surrogate", "\uDC00"],
      ["KR-10", "/s/3", "a string in NFC", "e\u0301"],
      ["KR-10", "/s/4", "Unicode characters, no noncharacter", "\uFFFF"],
    ]);
  });

  it("KR-10: escapes a key into the JSON Pointer (RFC 6901)", () => {
    expect(where(parseJson('{"a/b~c": -0}', { intent: null, path: "/f" }))).toEqual([["KR-10", "/f/a~1b~0c", "a number other than -0", "-0"]]);
  });

  it("KR-10: reads a value nested deeper than the call stack without overflow", () => {
    const depth = 200_000;
    const parsed = parseJson(`${"[".repeat(depth)}-0${"]".repeat(depth)}`);
    expect(parsed.ok ? [] : parsed.rejections.map((r) => r.path.length)).toEqual([depth * 2]);
    expect(parseJson(`${"[".repeat(depth)}${"]".repeat(depth)}`).ok).toBe(true);
  });

  it("KR-10: the bytes go through UTF-8 first, then the same parse", () => {
    expect(where(parseJsonBytes(new TextEncoder().encode('{"a": -0}'), { intent: null, path: "/f" }))).toEqual([["KR-10", "/f/a", "a number other than -0", "-0"]]);
  });
});
