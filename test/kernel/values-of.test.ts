// The values of a body with the schemas they meet (KR-18, KR-19): the walk
// fold reads references, external links and unique values from (LG-35).
import { describe, expect, it } from "vitest";
import { valuesOf, type JsonValue, type ResolveType } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const TYPES: { readonly [ref: string]: JsonValue } = deepFreeze({
  "demo/note@1": {
    abstract: false,
    kind: "entity",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", unique: true },
        refs: { type: "array", items: { type: "string", format: "ref", ref: { to: "demo/note@1", pin: "any", label: "cites" } } },
        tags: { type: "object", values: { type: "string", format: "uri", edge: "tag" } },
        shape: { $ref: "demo/shape@1" },
        loop: { $ref: "demo/loop@1" },
        part: {
          oneOf: [
            { type: "object", properties: { kind: { const: "a" }, to: { type: "string", format: "ref" } }, required: ["kind", "to"] },
            { type: "object", properties: { kind: { const: "b" }, n: { type: "integer" } }, required: ["kind", "n"] },
          ],
          discriminator: "kind",
        },
        any: { type: "any" },
      },
      required: ["title"],
    },
  },
  "demo/shape@1": { abstract: true, kind: "entity", schema: { type: "object", properties: { to: { type: "string", format: "ref" } }, required: ["to"] } },
  "demo/loop@1": { abstract: true, kind: "entity", schema: { $ref: "demo/loop@1" } },
  "demo/broken@1": { abstract: false, kind: "entity", schema: { type: "object", properties: { x: { nope: 1 } } } },
});

const resolve: ResolveType = (ref) => TYPES[ref] ?? null;

/** Each value met with a format or an annotation, as `path value`. */
const marked = (body: JsonValue, type = "demo/note@1") =>
  valuesOf(deepFreeze(body), type, resolve)
    .filter((v) => v.schema.format !== undefined || v.schema.unique !== undefined)
    .map((v) => [v.path, v.value, v.schema.format ?? "unique"]);

describe("valuesOf (KR-18, KR-19)", () => {
  it("KR-19: meets every field, item and map value with its schema, through $ref and the branch a union chooses, by path", () => {
    const body = { title: "t", refs: ["demo/a", "demo/b"], tags: { x: "https://x.org" }, shape: { to: "demo/s" }, part: { kind: "a", to: "demo/p" } };
    expect(marked(body)).toEqual([
      ["/part/to", "demo/p", "ref"],
      ["/refs/0", "demo/a", "ref"],
      ["/refs/1", "demo/b", "ref"],
      ["/shape/to", "demo/s", "ref"],
      ["/tags/x", "https://x.org", "uri"],
      ["/title", "t", "unique"],
    ]);
  });

  it("KR-18: does not look into type any, nor into a value its schema does not admit, nor into a branch no tag chooses", () => {
    const body = deepFreeze({ title: 7, refs: "demo/a", tags: ["https://x.org"], any: { to: "demo/a" }, part: { kind: "c", to: "demo/p" }, shape: "demo/s" });
    expect(marked(body)).toEqual([]);
    expect(valuesOf(body, "demo/note@1", resolve).map((v) => v.path)).toEqual(["", "/any", "/part", "/shape"]);
  });

  it("KR-15, Q-33: a type the kernel does not read gives no values; a $ref that comes back to itself stops", () => {
    expect([valuesOf(deepFreeze({}), "demo/none@1", resolve), valuesOf(deepFreeze({ x: 1 }), "demo/broken@1", resolve), valuesOf(deepFreeze({}), "not a ref", resolve)]).toEqual([[], [], []]);
    expect(valuesOf(deepFreeze({ title: "t", loop: { a: 1 } }), "demo/note@1", resolve).map((v) => v.path)).toEqual(["", "/loop", "/loop", "/title"]);
  });
});
