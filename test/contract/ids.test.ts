// ST-07: one set of contract tests for the `ids` port, run against every
// adapter; `ids-counter` is the deterministic one for tests.
import { describe, expect, it } from "vitest";
import { createIdsCounter } from "../../src/adapters/ids-counter/index.js";
import type { Ids } from "../../src/ledger/index.js";

// KR-11: 26 upper-case Crockford base32 characters; G-07: at most 128 bits.
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const ADAPTERS: readonly { readonly name: string; readonly make: () => Ids }[] = [
  { name: "ids-counter", make: () => createIdsCounter() },
];

describe.each(ADAPTERS)("ids port: $name", ({ make }) => {
  it("ST-07: ulid() is a ULID of KR-11", () => {
    expect(make().ulid()).toMatch(ULID);
  });

  it("ST-07: ulid() never repeats and grows in sort order", () => {
    const ids = make();
    const seq = Array.from({ length: 1000 }, () => ids.ulid());
    expect(new Set(seq).size).toBe(seq.length);
    expect(seq).toEqual([...seq].sort());
  });
});

describe("ids-counter", () => {
  it("ST-07: two counters give the same sequence", () => {
    const [a, b] = [createIdsCounter(), createIdsCounter()];
    expect([a.ulid(), a.ulid(), a.ulid()]).toEqual([b.ulid(), b.ulid(), b.ulid()]);
  });

  it("ST-07: carries the time part it was given", () => {
    expect(createIdsCounter({ time: "01JB2X0000" }).ulid()).toBe("01JB2X00000000000000000001");
  });
});
