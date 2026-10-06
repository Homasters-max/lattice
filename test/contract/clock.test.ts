// ST-07: one set of contract tests for the `clock` port, run against every
// adapter; `clock-fixed` is the deterministic one for tests.
import { describe, expect, it } from "vitest";
import { createClockFixed } from "../../src/adapters/clock-fixed/index.js";
import type { Clock } from "../../src/ledger/index.js";

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const AT = "2026-10-06T12:00:00.000000Z";

const ADAPTERS: readonly { readonly name: string; readonly make: () => Clock }[] = [
  { name: "clock-fixed", make: () => createClockFixed({ at: AT }) },
];

describe.each(ADAPTERS)("clock port: $name", ({ make }) => {
  it("ST-07: now() is a date-time in the canonical spelling of KR-11", () => {
    expect(make().now()).toMatch(DATE_TIME);
  });

  it("ST-07: now() never decreases (LG-06)", () => {
    const clock = make();
    const times = Array.from({ length: 5 }, () => clock.now());
    expect(times).toEqual([...times].sort());
  });
});

describe("clock-fixed", () => {
  it("ST-07: answers the time it was given, every time", () => {
    const clock = createClockFixed({ at: AT });
    expect([clock.now(), clock.now()]).toEqual([AT, AT]);
  });
});
