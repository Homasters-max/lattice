// The canonical scalar formats (KR-11): `isFormat` answers for a string, and
// `checkFormat` refuses with KR-11 at the place it is given. Every spelling of
// the vectors is in test/kernel/vectors.test.ts; here — the refusal itself.
import { describe, expect, it } from "vitest";
import { checkFormat, isFormat, isUlid, KR_11, reject } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

describe("formats (KR-11)", () => {
  it("KR-11: checkFormat takes a canonical spelling and refuses another, with the format expected and the value that came", () => {
    const place = deepFreeze({ intent: "demo/a", path: "/at" });
    expect(checkFormat("date-time", "2026-10-06T12:00:00.000000Z", place)).toEqual([]);
    expect(checkFormat("date-time", "2026-10-06T12:00:00Z", place)).toEqual([reject(KR_11, { ...place, expected: "date-time", got: "2026-10-06T12:00:00Z" })]);
    expect(checkFormat("decimal", "-0", { intent: null, path: "/body/price" })).toEqual([reject(KR_11, { intent: null, path: "/body/price", expected: "decimal", got: "-0" })]);
  });

  it("KR-11: refuses a value that is not a string", () => {
    for (const value of [0.5, null, ["2026-10-06"], { a: 1 }]) {
      expect(checkFormat("date", deepFreeze(value), { intent: null, path: "" }).map((r) => [r.rule, r.got])).toEqual([["KR-11", value]]);
    }
  });

  it("KR-11: a ULID is at most 128 bits (G-07), and isUlid is the format ulid", () => {
    expect([isFormat("ulid", "7ZZZZZZZZZZZZZZZZZZZZZZZZZ"), isFormat("ulid", "8ZZZZZZZZZZZZZZZZZZZZZZZZZ")]).toEqual([true, false]);
    expect([isUlid("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"), isUlid("8ZZZZZZZZZZZZZZZZZZZZZZZZZ")]).toEqual([true, false]);
  });

  it("KR-11: a calendar date is checked by the Gregorian leap years, and a date-time has no leap second (G-21)", () => {
    expect(["2024-02-29", "2000-02-29", "2100-02-29", "2023-02-29"].map((d) => isFormat("date", d))).toEqual([true, true, false, false]);
    expect(isFormat("date-time", "2016-12-31T23:59:60.000000Z")).toBe(false);
  });
});
