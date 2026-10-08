import { describe, expect, it } from "vitest";
import fc from "fast-check";

describe("toolchain", () => {
  it("runs a property with fast-check", () => {
    fc.assert(fc.property(fc.string(), (s) => s.length >= 0), { numRuns: 100 });
    expect(true).toBe(true);
  });
});
