// The closed form of an object (KR-04, KR-14, KR-19, LG-06, LG-09): the
// fields of an object against the table of its members — every member of its
// kind, no field outside the table — refused by the caller's rule at JSON
// Pointers (G-13, CONVENTIONS.md §3) in the order of CONVENTIONS.md §5. Every
// input crosses the module boundary frozen.
import { describe, expect, it } from "vitest";
import { closedRejections, KR_04, KR_14, reject, sortRejections, type JsonObject, type Members } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const MEMBERS: Members = deepFreeze({
  name: { expected: "a string", fits: (v) => typeof v === "string" },
  count: { expected: "a number or absent", fits: (v) => v === undefined || typeof v === "number" },
});

const ROOT = { intent: null, path: "/0" };

const check = (value: JsonObject) => closedRejections(deepFreeze(value), MEMBERS, KR_04, ROOT);

describe("the closed form of an object", () => {
  it("takes every member in its kind, an optional one absent too", () => {
    expect([check({ name: "a", count: 1 }), check({ name: "a" })]).toEqual([[], []]);
  });

  it("LG-17: refuses a field outside the table: expected absent, got the value that came", () => {
    expect(check({ name: "a", seq: 3 })).toEqual([reject(KR_04, { ...ROOT, path: "/0/seq", expected: "absent", got: 3 })]);
  });

  it("LG-17: refuses a member not of its kind with what the table expects, and a missing one as absent", () => {
    expect(check({ name: 1, count: "x" })).toEqual([
      reject(KR_04, { ...ROOT, path: "/0/count", expected: "a number or absent", got: "x" }),
      reject(KR_04, { ...ROOT, path: "/0/name", expected: "a string", got: 1 }),
    ]);
    expect(check({})).toEqual([reject(KR_04, { ...ROOT, path: "/0/name", expected: "a string", got: "absent" })]);
  });

  it("LG-17: the path is a JSON Pointer — / and ~ in the name of a field escaped (Q-32)", () => {
    expect(check({ name: "a", "a/b~c": 1 })).toEqual([reject(KR_04, { ...ROOT, path: "/0/a~1b~0c", expected: "absent", got: 1 })]);
  });

  it("LG-17: refuses in the order of CONVENTIONS.md §5, whatever the order of the fields", () => {
    const got = check({ z: 1, count: "x", b: 2 });
    expect(got).toEqual(sortRejections(got));
    expect(got.map((r) => r.path)).toEqual(["/0/b", "/0/count", "/0/name", "/0/z"]);
  });

  it("LG-17: refuses by the caller's rule, about the caller's intent, from the caller's path", () => {
    const place = { intent: "demo/a", path: "/body" };
    expect(closedRejections(deepFreeze({ name: "a", extra: true }), MEMBERS, KR_14, place)).toEqual([
      reject(KR_14, { ...place, path: "/body/extra", expected: "absent", got: true }),
    ]);
  });
});
