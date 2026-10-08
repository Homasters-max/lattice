// Norms of form that code can check (ST-16, S0-50): data at module level is
// readonly, the root place is ROOT, code exports by name, and only the md
// builders cast to a type of the model. Each refusal names the norm.
import { beforeAll, describe, expect, it } from "vitest";
import { auditForm, defaultExports } from "./audit-form.js";
import { alone, tree } from "./cases.js";

const inTrust = (code: string) => auditForm(alone("src/trust/x.ts", code));

// The lib files every program of the run shares are parsed and bound here,
// not in the first case (as in purity.test.ts).
beforeAll(() => {
  alone("src/trust/x.ts", "").program().getTypeChecker();
}, 30_000);

describe("form: data at module level is readonly (ST-03)", () => {
  const refusal = (name: string, what: string, line = 1) =>
    `ST-03: src/trust/x.ts:${line} declares ${name} at module level as ${what}; data at module level is readonly`;

  it("ST-03: refuses a mutable array, tuple, Map or Set at module level", () => {
    const code = [
      "export const a = [1, 2];",
      "const b: string[] = [];",
      "export const t: [number, number] = [1, 2];",
      "export const m = new Map<string, number>();",
      "export const s: Set<string> | null = null;",
      "export const w = new WeakMap<object, number>();",
      "export const used = [b, t];",
      "",
    ].join("\n");
    expect(inTrust(code)).toEqual([
      refusal("a", "a mutable array"),
      refusal("b", "a mutable array", 2),
      refusal("t", "a mutable tuple", 3),
      refusal("m", "a mutable Map", 4),
      refusal("s", "a mutable Set", 5),
      refusal("w", "a mutable WeakMap", 6),
      refusal("used", "a mutable array", 7),
    ]);
  });

  it("ST-03: passes readonly arrays, tuples, maps and sets, frozen values, and mutable data inside a function", () => {
    const code = [
      "export const a: readonly number[] = [1, 2];",
      "export const c = [1, 2] as const;",
      "export const f = Object.freeze([1, 2]);",
      "export const m: ReadonlyMap<string, number> = new Map([['a', 1]]);",
      "export const s: ReadonlySet<string> = new Set(['a']);",
      "export const r: ReadonlyArray<string> = [];",
      "export function make(): number[] {",
      "  const local = [1];",
      "  return local;",
      "}",
      "",
    ].join("\n");
    expect(inTrust(code)).toEqual([]);
  });

  it("ST-03: holds in adapters too", () => {
    expect(auditForm(alone("src/adapters/store-x/index.ts", "export const NAMES = ['a'];\n"))).toEqual([
      "ST-03: src/adapters/store-x/index.ts:1 declares NAMES at module level as a mutable array; data at module level is readonly",
    ]);
  });
});

describe("form: the root place is ROOT (LG-17)", () => {
  const refusal = (line: number) => `LG-17: src/trust/x.ts:${line} writes the root place as a literal; use ROOT of the kernel`;

  it("LG-17: refuses a literal of the root place, alone or with the fields of a rejection", () => {
    const code = ['export const p = { intent: null, path: "" };', 'export const q = { path: "", intent: null, expected: 1, got: 2 };', ""].join("\n");
    expect(inTrust(code)).toEqual([refusal(1), refusal(2)]);
  });

  it("LG-17: passes ROOT itself in rejection.ts, a place inside an intent and a path from another root", () => {
    const root = 'export const ROOT = { intent: null, path: "" };\n';
    expect(auditForm(alone("src/kernel/rejection.ts", root))).toEqual([]);
    const code = ['export const p = { intent: "a/b", path: "" };', 'export const q = { intent: null, path: "/sig" };', 'export const v = { path: "", keyword: "type" };', ""].join("\n");
    expect(inTrust(code)).toEqual([]);
  });
});

describe("form: code exports by name (ST-16)", () => {
  const refusal = (path: string, line = 1) => `ST-16: ${path}:${line} exports default; code exports by name — only a tool config exports default`;

  it("ST-16: refuses `export default` and a name exported as default", () => {
    expect(inTrust("export default 1;\n")).toEqual([refusal("src/trust/x.ts")]);
    expect(inTrust("const x = 1;\nexport { x as default };\n")).toEqual([refusal("src/trust/x.ts", 2)]);
  });

  it("ST-16: refuses a default export in a test or a script, and passes named exports and the import of a config", () => {
    expect(defaultExports("test/x.test.ts", "export default {};\n")).toEqual([refusal("test/x.test.ts")]);
    expect(defaultExports("scripts/x.mjs", "export default function run() {}\n")).toEqual([refusal("scripts/x.mjs")]);
    expect(defaultExports("test/x.test.ts", 'import config from "../vitest.config.js";\nexport const c = config;\nexport { c as d };\n')).toEqual([]);
  });
});

describe("form: a value of the md model is made by its builders (LG-42)", () => {
  const model = "declare const BUILT: unique symbol;\nexport type Doc = { readonly [BUILT]: true; readonly heading: string };\n";
  const cast = 'import type { Doc } from "./model.js";\nexport const d = { heading: "x" } as unknown as Doc;\n';

  it("LG-42: refuses a cast to a type of the model outside src/codec/build.ts", () => {
    const t = tree({ "src/codec/model.ts": model, "src/codec/parse.ts": cast });
    expect(auditForm(t)).toEqual(["LG-42: src/codec/parse.ts:2 casts to Doc, a type of the md model; only the builders of src/codec/build.ts make one"]);
  });

  it("LG-42: passes the cast in src/codec/build.ts, after its checks", () => {
    expect(auditForm(tree({ "src/codec/model.ts": model, "src/codec/build.ts": cast }))).toEqual([]);
  });
});
