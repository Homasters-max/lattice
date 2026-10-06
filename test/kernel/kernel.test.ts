// The thin kernel of the walking skeleton: the kernel version (KR-03), the
// grammar of ids (KR-06) and the form of a rejection (LG-17, CONVENTIONS.md §3).
// Canon, hash and the full header arrive with S0-04 and S0-05.
import { describe, expect, it } from "vitest";
import { canon, checkId, hashRecord, isEntityId, isUlid, KERNEL_VERSION, reject, sortRejections } from "../../src/kernel/index.js";
import { KR_06, RULES } from "../../src/kernel/rules.js";

describe("kernel version (KR-03)", () => {
  it("KR-03: is 0 before the switch", () => {
    expect(KERNEL_VERSION).toBe("0");
  });
});

describe("ids (KR-06)", () => {
  it("KR-06: an entity id is namespace/slug", () => {
    for (const id of ["demo/hello", "std/requirement", "a/0", "lattice/02-kernel.canon", "a-b/c.d-e"]) expect([id, isEntityId(id)]).toEqual([id, true]);
    for (const id of ["Demo/hello", "demo", "demo/", "/x", "1a/x", "a/b/c", "a/.x", "a/-x", "a/B"]) expect([id, isEntityId(id)]).toEqual([id, false]);
  });

  it("KR-06: an event id is a ULID", () => {
    expect(isUlid("01JB2X00000000000000000SES")).toBe(true);
    for (const id of ["01jb2x00000000000000000ses", "01JB2X0000000000000000000", "01JB2X00000000000000000SEI", "81JB2X00000000000000000SES"]) {
      expect([id, isUlid(id)]).toEqual([id, false]);
    }
  });

  it("KR-06: checkId refuses with KR-06 at the place it is given", () => {
    expect(checkId("entity", "demo/hello", { intent: "demo/hello", path: "/id" })).toEqual([]);
    expect(checkId("event", "demo/hello", { intent: "demo/hello", path: "/id" })).toEqual([
      reject(KR_06, { intent: "demo/hello", path: "/id", expected: "a ULID", got: "demo/hello" }),
    ]);
  });
});

describe("rejections (LG-17)", () => {
  it("fills the message template of its rule with canonical JSON", () => {
    expect(reject(KR_06, { intent: null, path: "/intents/0/id", expected: "namespace/slug", got: "A/b" })).toEqual({
      intent: null,
      rule: "KR-06",
      message: 'an entity id is namespace/slug and an event id is a ULID; got "A/b"',
      path: "/intents/0/id",
      expected: "namespace/slug",
      got: "A/b",
    });
  });

  it("sorts by intent (null first), path, rule, then expected and got", () => {
    const at = (intent: string | null, path: string, got: string) => reject(KR_06, { intent, path, expected: "x", got });
    const sorted = [at(null, "/a", "1"), at("a", "/id", "1"), at("a", "/id", "2"), at("b", "/at", "1")];
    expect(sortRejections([sorted[3], sorted[2], sorted[0], sorted[1]].filter((r) => r !== undefined))).toEqual(sorted);
  });

  it("registers every rule of the kernel once", () => {
    expect(RULES.map((r) => r.id)).toEqual(["KR-06"]);
  });
});

describe("thin canon and hash", () => {
  it("sorts keys by UTF-16 code units and hashes canon({type, body}) (KR-12)", () => {
    expect(canon({ b: [1, "x"], a: null, "é": true, Z: {} })).toBe('{"Z":{},"a":null,"b":[1,"x"],"é":true}');
    expect(hashRecord("demo/note@1", { text: "hello" })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashRecord("demo/note@1", { text: "hello" })).not.toBe(hashRecord("demo/note@2", { text: "hello" }));
  });
});
