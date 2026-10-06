// ST-07: one set of contract tests for the `acts` port, run against every
// adapter of S0-03.
import { describe, expect, it } from "vitest";
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import type { Act, Acts } from "../../src/ledger/index.js";

const ACT: Act = { verb: "approve", target: "sha256:p", identity: "owner", uri: "fixture:cr/a", at: "2026-10-06T12:00:00.000000Z", verified: true };

const ADAPTERS: readonly { readonly name: string; readonly make: (acts: { readonly [r: string]: readonly Act[] }) => Acts }[] = [
  { name: "acts-fixture", make: (acts) => createActsFixture({ acts }) },
];

describe.each(ADAPTERS)("acts port: $name", ({ make }) => {
  it("ST-07, TR-14: reads the acts of a change request and none of another", async () => {
    const acts = make({ "cr/a": [ACT] });
    expect(await acts.read("cr/a")).toEqual([ACT]);
    expect(await acts.read("cr/b")).toEqual([]);
  });
});
