// The kernel version (KR-03), the grammar of ids (KR-06), the header on the
// surface (KR-04), the form of a rejection (LG-17, CONVENTIONS.md §3) and the
// hash of bytes (LG-30). Canon, hash and formats are in canon.test.ts,
// parse.test.ts, formats.test.ts and vectors.test.ts; the full header is in
// record.test.ts, references and links in ref.test.ts. Every input crosses the
// module boundary frozen.
import { describe, expect, it } from "vitest";
import { checkHeader, checkId, hashBytes, isEntityId, isUlid, KERNEL_VERSION, parseJson, parseJsonBytes, reject, sortRejections } from "../../src/kernel/index.js";
import { KR_04, KR_06, RULES } from "../../src/kernel/rules.js";
import { deepFreeze } from "../support/deep-freeze.js";

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
    const place = deepFreeze({ intent: "demo/hello", path: "/id" });
    expect(checkId("entity", "demo/hello", place)).toEqual([]);
    expect(checkId("event", "demo/hello", place)).toEqual([reject(KR_06, { ...place, expected: "a ULID", got: "demo/hello" })]);
  });
});

describe("the header of a record (KR-04)", () => {
  const record = deepFreeze({ id: "demo/a", rev: 1, type: "demo/note@1", hash: "sha256:00", by: "01JB2X00000000000000000SES", at: "2026-10-06T12:00:00.000000Z", body: {} });

  it("KR-04: takes a header with every field of its kind, rev absent for an event", () => {
    const { rev, ...event } = record;
    expect([rev, checkHeader(record, "/records/0"), checkHeader(deepFreeze({ ...event, id: "01JB2X00000000000000000EVT" }), "/records/1")]).toEqual([1, [], []]);
  });

  it("KR-04: refuses a field of the wrong kind or absent, and a record that is no object, at the path given, with the value that came", () => {
    const { hash, ...noHash } = record;
    expect([hash, ...checkHeader(deepFreeze({ ...noHash, rev: "1" }), "/0").map((r) => [r.rule, r.path, r.got])]).toEqual([
      "sha256:00",
      ["KR-04", "/0/rev", "1"],
      ["KR-04", "/0/hash", "absent"],
    ]);
    expect(checkHeader(null, "/0")).toEqual([reject(KR_04, { intent: null, path: "/0", expected: "a record", got: null })]);
    expect(checkHeader(deepFreeze([1]), "/0").map((r) => r.got)).toEqual([[1]]);
  });
});

describe("rejections (LG-17)", () => {
  it("LG-17: fills the message template of its rule with canonical JSON", () => {
    expect(reject(KR_06, deepFreeze({ intent: null, path: "/intents/0/id", expected: "namespace/slug", got: "A/b" }))).toEqual({
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
    expect(sortRejections(deepFreeze([sorted[3], sorted[2], sorted[0], sorted[1]].filter((r) => r !== undefined)))).toEqual(sorted);
  });

  it("ST-17: registers every rule the kernel enforces once", () => {
    expect(RULES.map((r) => r.id)).toEqual(["KR-04", "KR-06", "KR-07", "KR-08", "KR-10", "KR-11", "KR-13", "KR-18", "KR-19", "KR-21", "KR-23", "KR-24"]);
  });
});

describe("the hash of bytes (LG-30)", () => {
  it("LG-30: hashes raw bytes in the form of KR-12", () => {
    expect(hashBytes(new TextEncoder().encode("abc"))).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashBytes(Uint8Array.from([0xff]))).not.toBe(hashBytes(Uint8Array.from([0xfe])));
  });
});

describe("reading JSON (KR-10)", () => {
  // Q-19: bytes that are not UTF-8 are named by their hash.
  it("KR-10: refuses bytes that are not UTF-8 — named by their hash — and a text that is not JSON, at the place given", () => {
    const bytes = Uint8Array.from([0x7b, 0xff, 0x7d]);
    expect(parseJsonBytes(bytes, "/store/proposals/a.json")).toMatchObject({ ok: false, rejections: [{ rule: "KR-10", path: "/store/proposals/a.json", got: hashBytes(bytes) }] });
    expect(parseJson("{", "/3")).toMatchObject({ ok: false, rejections: [{ rule: "KR-10", path: "/3", intent: null, got: "{" }] });
    expect(parseJson('{"a":[1,"x"]}')).toEqual({ ok: true, value: { a: [1, "x"] } });
  });
});
