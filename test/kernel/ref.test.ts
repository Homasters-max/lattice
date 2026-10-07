// References (KR-23, KR-25) and external links (KR-24): the grammar as a
// table of strings the kernel takes and refuses, the round trip of
// `formatRef` and `parseRef` as a property, and the refusal itself. Every
// input crosses the module boundary frozen.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkUri, formatRef, isUri, KR_23, KR_24, parseRef, reject, type Ref } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const ULID = "01JB2X00000000000000000SES";

/** Valid references and what they parse to. */
const VALID: readonly (readonly [string, Ref])[] = [
  ["demo/hello", { kind: "entity", id: "demo/hello" }],
  ["demo/hello@1", { kind: "entity", id: "demo/hello", rev: 1 }],
  ["lattice/02-kernel.canon@12", { kind: "entity", id: "lattice/02-kernel.canon", rev: 12 }],
  ["demo/hello@9007199254740991", { kind: "entity", id: "demo/hello", rev: 9007199254740991 }],
  ["demo/hello#body", { kind: "entity", id: "demo/hello", fragment: ["body"] }],
  ["demo/hello@3#items/0/text", { kind: "entity", id: "demo/hello", rev: 3, fragment: ["items", "0", "text"] }],
  ["demo/hello#field_name/007", { kind: "entity", id: "demo/hello", fragment: ["field_name", "007"] }],
  [ULID, { kind: "event", id: ULID }],
  [`${ULID}#of`, { kind: "event", id: ULID, fragment: ["of"] }],
];

/** Invalid references: what is broken in each. */
const INVALID: readonly (readonly [string, string])[] = [
  ["", "empty"],
  ["Demo/hello", "upper-case namespace"],
  ["demo", "no slug"],
  ["demo/a/b", "a slug with a slash"],
  ["demo/.a", "a slug starting with a dot"],
  ["demo/hello@", "an empty revision"],
  ["demo/hello@0", "revision 0 (G-12)"],
  ["demo/hello@01", "a revision with a leading zero (G-12)"],
  ["demo/hello@-1", "a negative revision"],
  ["demo/hello@1.5", "a fractional revision"],
  ["demo/hello@9007199254740992", "a revision outside the safe integers (G-20)"],
  ["demo/hello@1@2", "two revisions"],
  [`${ULID}@1`, "a revision of an event"],
  ["01jb2x00000000000000000ses", "a lower-case ULID"],
  ["demo/hello#", "an empty fragment"],
  ["demo/hello#a//b", "an empty segment"],
  ["demo/hello#a/", "a trailing slash"],
  ["demo/hello#/a", "a leading slash"],
  ["demo/hello#Body", "an upper-case segment"],
  ["demo/hello#_a", "a segment starting with an underscore"],
  ["demo/hello#a#b", "a second fragment"],
  ["demo/hello#a b", "a space in a segment"],
  [" demo/hello", "a leading space"],
];

describe("references (KR-23)", () => {
  it("KR-23: parses entity references, floating and pinned, event references and fragments", () => {
    for (const [s, ref] of VALID) expect([s, parseRef(s)]).toEqual([s, { ok: true, value: ref }]);
  });

  it("KR-23: refuses a string outside the grammar, with KR-23 at the place given and the string that came", () => {
    for (const [s, why] of INVALID) {
      const place = deepFreeze({ intent: "demo/a", path: "/body/to" });
      expect([why, parseRef(s, place)]).toEqual([why, { ok: false, rejections: [reject(KR_23, { ...place, expected: "id, id@n or a ULID, with an optional fragment #seg/…", got: s })] }]);
    }
  });

  it("KR-23: a map key in a fragment may hold `@` and `.` — the fragment is read only after `#`, so it never meets `id@n`", () => {
    expect(parseRef("demo/hello@2#labels/v1.2@beta")).toEqual({ ok: true, value: { kind: "entity", id: "demo/hello", rev: 2, fragment: ["labels", "v1.2@beta"] } });
    expect(parseRef("demo/hello#a@1")).toEqual({ ok: true, value: { kind: "entity", id: "demo/hello", fragment: ["a@1"] } });
  });

  it("KR-23: formats a reference back to the string it was parsed from", () => {
    for (const [s, ref] of VALID) expect(formatRef(deepFreeze(ref))).toBe(s);
  });

  it("KR-23: formatRef(parseRef(s)) is s for every valid reference", () => {
    const namespace = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
    const slug = fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,12}$/);
    const ulid = fc.stringMatching(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const segment = fc.stringMatching(/^[a-z0-9][a-z0-9._@-]{0,8}$/);
    const fragment = fc.option(fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => `#${s.join("/")}`), { nil: "" });
    const entity = fc.tuple(namespace, slug, fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }), fragment)
      .map(([n, s, rev, f]) => `${n}/${s}${rev === undefined ? "" : `@${rev}`}${f}`);
    const event = fc.tuple(ulid, fragment).map(([u, f]) => `${u}${f}`);
    fc.assert(
      fc.property(fc.oneof(entity, event), (s) => {
        const parsed = parseRef(s);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(formatRef(parsed.value)).toBe(s);
      }),
    );
  });

  it("KR-25: parses without resolving — a reference to a target no ledger holds is a reference", () => {
    expect(parseRef("nowhere/nothing@99#no/such/field").ok).toBe(true);
  });
});

/** Absolute URIs (RFC 3986 `URI`, G-06: a scheme is required, a fragment is allowed). */
const URIS: readonly string[] = [
  "https://example.com",
  "https://example.com/a/b?c=d&e=f#g",
  "http://user:pass@example.com:8080/p%20q",
  "http://[::1]:8080/",
  "http://[2001:db8::7]/c=GB?objectClass?one",
  "http://[2001:db8:0:0:0:0:2:1]/",
  "http://[::ffff:192.0.2.1]/",
  "http://[v7.fe80::abcd]/",
  "http://192.0.2.16:80/",
  "file:///etc/hosts",
  "mailto:someone@example.com",
  "urn:isbn:0451450523",
  "tel:+1-816-555-1212",
  "news:comp.infosystems.www.servers.unix",
  "ldap://[2001:db8::7]/c=GB?objectClass?one",
  "a:",
  "git+ssh://git@example.com/repo.git",
];

/** Strings that are no absolute URI, and why. */
const NOT_URIS: readonly (readonly [string, string])[] = [
  ["", "empty"],
  ["example.com", "no scheme"],
  ["//example.com/a", "a network-path reference without a scheme"],
  ["docs/design/02-kernel.md", "a relative path"],
  ["#section", "a fragment alone"],
  ["1http://example.com", "a scheme starting with a digit"],
  ["ht tp://example.com", "a space in the scheme"],
  ["https://exa mple.com", "a space in the host"],
  ["https://example.com/a b", "a space in the path"],
  ["https://example.com/%zz", "a broken percent-encoding"],
  ["https://example.com/%2", "a short percent-encoding"],
  ["https://example.com/#a#b", "a second #"],
  ["https://example.com/ü", "a character outside ASCII (an IRI, not a URI)"],
  ["http://[::1/", "an unclosed IP literal"],
  ["http://[1:2:3:4:5:6:7:8:9]/", "nine IPv6 groups"],
  ["http://[1::2::3]/", "two :: in IPv6"],
  ["http://[12345::]/", "an IPv6 group of five digits"],
  ["http://example.com:80a/", "a port that is not digits"],
  ["http://a@b@c/", "two @ in the authority"],
  ["https://example.com/<a>", "angle brackets"],
];

describe("external links (KR-24)", () => {
  it("KR-24: takes an absolute URI, a fragment too (G-06)", () => {
    for (const s of URIS) expect([s, isUri(s)]).toEqual([s, true]);
  });

  it("KR-24: refuses a string that is no absolute URI", () => {
    for (const [s, why] of NOT_URIS) expect([why, isUri(s)]).toEqual([why, false]);
  });

  it("KR-24: checkUri refuses with KR-24 at the place given — a value that is not a string too", () => {
    const place = deepFreeze({ intent: "demo/a", path: "/body/link" });
    expect(checkUri("https://example.com", place)).toEqual([]);
    expect(checkUri("example.com", place)).toEqual([reject(KR_24, { ...place, expected: "an absolute URI", got: "example.com" })]);
    expect(checkUri(deepFreeze(["https://example.com"]), place).map((r) => [r.rule, r.got])).toEqual([["KR-24", ["https://example.com"]]]);
  });
});
