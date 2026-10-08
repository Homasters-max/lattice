// Canon (KR-10), hash (KR-12) and the body limit (KR-13). Canon takes only
// I-JSON with every string in NFC and refuses the rest at its JSON Pointer;
// the hash is over canon({type, body}); a body is at most 256 KiB of canonical
// UTF-8 bytes (G-05). Every input crosses the module boundary frozen.
import fc from "fast-check";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BODY_LIMIT, canon, hash, hashRecord, parseJson, type JsonValue } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const where = (r: ReturnType<typeof canon>) => (r.ok ? [] : r.rejections.map((x) => [x.rule, x.intent, x.path, x.expected, x.got]));

describe("canon (KR-10)", () => {
  it("KR-10: writes keys sorted by UTF-16 code units, numbers as ECMAScript does, strings escaped as JCS", () => {
    const value = deepFreeze({ b: [1, "x", 4.5, 1e-7, -0.5], a: null, "\u00E9": true, Z: {}, "\u{1F600}": "\u0007\n\"\\/", "\uFB01": false });
    expect(canon(value)).toEqual({ ok: true, value: '{"Z":{},"a":null,"b":[1,"x",4.5,1e-7,-0.5],"\u00E9":true,"\u{1F600}":"\\u0007\\n\\"\\\\/","\uFB01":false}' });
  });

  it("KR-10: refuses -0, NaN, Infinity and an integer outside ±(2^53−1), each at its JSON Pointer", () => {
    expect(where(canon(deepFreeze({ a: [0, -0], b: Number.NaN, c: { d: -Infinity }, e: 2 ** 53, "x/y~": 1e300 })))).toEqual([
      ["KR-10", null, "/a/1", "a number other than -0", "-0"],
      ["KR-10", null, "/b", "a finite number", "NaN"],
      ["KR-10", null, "/c/d", "a finite number", "-Infinity"],
      ["KR-10", null, "/e", "an integer within ±(2^53−1)", 2 ** 53],
      ["KR-10", null, "/x~1y~0", "an integer within ±(2^53−1)", 1e300],
    ]);
  });

  it("KR-10: refuses a string or a key not in NFC, with a lone surrogate or with a noncharacter (I-JSON)", () => {
    expect(where(canon(deepFreeze({ a: "e\u0301", ["k\u0301"]: 1, s: ["\uD800x", "x\uDC00"], n: "\uFFFE", m: "\u{10FFFF}" })))).toEqual([
      ["KR-10", null, "/a", "a string in NFC", "e\u0301"],
      ["KR-10", null, "/k\u0301", "a string in NFC", "k\u0301"],
      ["KR-10", null, "/m", "Unicode characters, no noncharacter", "\u{10FFFF}"],
      ["KR-10", null, "/n", "Unicode characters, no noncharacter", "\uFFFE"],
      ["KR-10", null, "/s/0", "Unicode scalar values, no lone surrogate", "\uD800x"],
      ["KR-10", null, "/s/1", "Unicode scalar values, no lone surrogate", "x\uDC00"],
    ]);
  });

  it("KR-10: refuses at the place it is given — inside an intent, or under the path of its input (G-13)", () => {
    expect(where(canon(deepFreeze({ x: -0 }), deepFreeze({ intent: "demo/a", path: "/body" })))).toEqual([["KR-10", "demo/a", "/body/x", "a number other than -0", "-0"]]);
    expect(where(canon("e\u0301", deepFreeze({ intent: null, path: "/session" })))).toEqual([["KR-10", null, "/session", "a string in NFC", "e\u0301"]]);
  });

  it("KR-10: writes a value nested deeper than the call stack without overflow", () => {
    let deep: JsonValue = [];
    for (let i = 0; i < 100_000; i++) deep = Object.freeze([deep]);
    const text = canon(deep);
    expect(text.ok && text.value.length).toBe(200_002);
  });
});

/** A JSON value KR-10 admits: strings in NFC without noncharacters, no -0, integers within ±(2^53−1). */
const admitted = fc
  .jsonValue({ stringUnit: "binary" })
  .map(function clean(v: unknown): JsonValue {
    if (typeof v === "string") return v.replace(/\p{Noncharacter_Code_Point}/gu, "").normalize("NFC");
    if (typeof v === "number") return Object.is(v, -0) || (Number.isInteger(v) && !Number.isSafeInteger(v)) ? 0 : v;
    if (Array.isArray(v)) return v.map(clean);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [clean(k) as string, clean(x)]));
    return v as JsonValue;
  });

const textOf = (v: JsonValue): string => {
  const r = canon(v);
  if (!r.ok) throw new Error(`a value the arbitrary admits is refused: ${r.rejections[0].path}`);
  return r.value;
};

describe("canon properties (KR-10)", () => {
  it("KR-10: canon(parse(canon(x))) == canon(x)", () => {
    fc.assert(
      fc.property(admitted.map(deepFreeze), (v) => {
        const parsed = parseJson(textOf(v));
        expect(parsed.ok && textOf(parsed.value)).toBe(textOf(v));
      }),
      { numRuns: 100 },
    );
  });

  it("KR-10: an order of keys does not change canon", () => {
    const object = fc.dictionary(fc.string().map((s) => s.normalize("NFC").replace(/\p{Noncharacter_Code_Point}/gu, "")), admitted);
    fc.assert(
      fc.property(object.map(deepFreeze), (o) => {
        const reversed = deepFreeze(Object.fromEntries(Object.entries(o).reverse()));
        expect(textOf(reversed)).toBe(textOf(o));
      }),
      { numRuns: 100 },
    );
  });
});

describe("hash (KR-12)", () => {
  it("KR-12: hashRecord is sha256 of canon({type, body}), and the type is part of it", () => {
    const body = deepFreeze({ text: "hello" });
    const digest = createHash("sha256").update('{"body":{"text":"hello"},"type":"demo/note@1"}', "utf8").digest("hex");
    expect(hashRecord("demo/note@1", body)).toEqual({ ok: true, value: `sha256:${digest}` });
    expect(hash(deepFreeze({ type: "demo/note@1", body }))).toEqual({ ok: true, value: `sha256:${digest}` });
    expect(hashRecord("demo/note@2", body)).not.toEqual(hashRecord("demo/note@1", body));
  });

  it("KR-12: the hash of what canon refuses is refused with KR-10", () => {
    expect(where(hashRecord("demo/note@1", deepFreeze({ x: -0 }), deepFreeze({ intent: "demo/a", path: "" })))).toEqual([["KR-10", "demo/a", "/body/x", "a number other than -0", "-0"]]);
    expect(where(hash(deepFreeze(["e\u0301"])))).toEqual([["KR-10", null, "/0", "a string in NFC", "e\u0301"]]);
  });
});

describe("the body limit (KR-13)", () => {
  // The canonical bytes of a string body are its UTF-8 bytes and two quotes.
  const body = (bytes: number) => "x".repeat(bytes - 2);

  it("KR-13: is 256 KiB of canonical UTF-8 bytes of the body, a constant of the kernel version (G-05)", () => {
    expect(BODY_LIMIT).toBe(262_144);
    expect(hashRecord("demo/note@1", body(BODY_LIMIT)).ok).toBe(true);
    expect(where(hashRecord("demo/note@1", body(BODY_LIMIT + 1), deepFreeze({ intent: "demo/a", path: "" })))).toEqual([["KR-13", "demo/a", "/body", BODY_LIMIT, BODY_LIMIT + 1]]);
  });

  it("KR-13: counts UTF-8 bytes, not UTF-16 code units", () => {
    const euros = "\u20AC".repeat(Math.ceil(BODY_LIMIT / 3));
    expect(euros.length).toBeLessThan(BODY_LIMIT);
    expect(hashRecord("demo/note@1", euros).ok).toBe(false);
  });
});
