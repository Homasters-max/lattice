// The thin kernel of the walking skeleton: the kernel version (KR-03), the
// grammar of ids (KR-06) and the form of a rejection (LG-17, CONVENTIONS.md §3).
// Canon, hash and the full header arrive with S0-04 and S0-05.
import { describe, expect, it } from "vitest";
import { canon, checkId, decodeUtf8, hashRecord, isEntityId, isUlid, KERNEL_VERSION, parseJson, reject, sortRejections } from "../../src/kernel/index.js";
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
  it("LG-17: fills the message template of its rule with canonical JSON", () => {
    expect(reject(KR_06, { intent: null, path: "/intents/0/id", expected: "namespace/slug", got: "A/b" })).toEqual({
      intent: null,
      rule: "KR-06",
      message: 'an entity id is namespace/slug and an event id is a ULID; got "A/b"',
      path: "/intents/0/id",
      expected: "namespace/slug",
      got: "A/b",
    });
  });

  it("LG-17: sorts by intent (null first), path, rule, then expected and got", () => {
    const at = (intent: string | null, path: string, got: string) => reject(KR_06, { intent, path, expected: "x", got });
    const sorted = [at(null, "/a", "1"), at("a", "/id", "1"), at("a", "/id", "2"), at("b", "/at", "1")];
    expect(sortRejections([sorted[3], sorted[2], sorted[0], sorted[1]].filter((r) => r !== undefined))).toEqual(sorted);
  });

  it("ST-17: registers every rule the kernel enforces once", () => {
    expect(RULES.map((r) => r.id)).toEqual(["KR-06", "KR-10"]);
  });
});

describe("thin canon and hash", () => {
  it("KR-12: sorts keys by UTF-16 code units and hashes canon({type, body})", () => {
    expect(canon({ b: [1, "x"], a: null, "é": true, Z: {} })).toBe('{"Z":{},"a":null,"b":[1,"x"],"é":true}');
    expect(hashRecord("demo/note@1", { text: "hello" })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashRecord("demo/note@1", { text: "hello" })).not.toBe(hashRecord("demo/note@2", { text: "hello" }));
  });
});

describe("reading JSON (KR-10)", () => {
  it("KR-10: refuses bytes that are not UTF-8 and a text that is not JSON, at the place given", () => {
    expect(decodeUtf8(Uint8Array.from([0x7b, 0xff, 0x7d]), "/store/proposals/a.json")).toMatchObject({ ok: false, rejections: [{ rule: "KR-10", path: "/store/proposals/a.json" }] });
    expect(parseJson("{", "/3")).toMatchObject({ ok: false, rejections: [{ rule: "KR-10", path: "/3", intent: null }] });
    expect(parseJson('{"a":[1,"x"]}')).toEqual({ ok: true, value: { a: [1, "x"] } });
  });

  it("G-16: until S0-04 the parse still takes duplicate keys — the limit is known, not hidden", () => {
    expect(parseJson('{"a":1,"a":2}')).toEqual({ ok: true, value: { a: 2 } });
  });
});
