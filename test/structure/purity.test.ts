// ST-04, KR-02: pure code has no clock, randomness, environment, network,
// files, scheduler, locale, evaluation, GC, console or state at module level.
import { beforeAll, describe, expect, it } from "vitest";
import { auditPurity } from "./audit-purity.js";
import { alone } from "./cases.js";

const inTrust = (code: string) => auditPurity(alone("src/trust/x.ts", code));
const refusal = (use: string, line = 1, rule = "ST-04", path = "src/trust/x.ts") =>
  `${rule}: ${path}:${line} uses ${use}; pure code reaches the world only through ports`;

const REFUSED: readonly (readonly [string, string])[] = [
  ["export const t = Date.now();\n", "Date.now"],
  ['export const t = Date["now"]();\n', "Date.now"],
  ["export const t = new Date();\n", "new Date() without an argument"],
  ["export const t = Date();\n", "Date() as a function"],
  ["export const h = new Date(0).getHours();\n", "getHours of a Date, in local time"],
  ["export const s = new Date(0).toString();\n", "toString of a Date, in local time"],
  ["export const r = Math.random();\n", "Math.random"],
  ["export const u = crypto.randomUUID();\n", "crypto"],
  ["export const p = performance.now();\n", "performance"],
  ["export const e = process.env;\n", "process"],
  ["export const g = globalThis;\n", "globalThis"],
  ["export const u = import.meta.url;\n", "import.meta"],
  ['export const f = fetch("https://example.org");\n', "fetch"],
  ["export const w = WebSocket;\n", "WebSocket"],
  ["setTimeout(() => 1, 0);\n", "setTimeout"],
  ["queueMicrotask(() => 1);\n", "queueMicrotask"],
  ['export const c = "a".localeCompare("b");\n', "localeCompare"],
  ["export const n = (1).toLocaleString();\n", "toLocaleString"],
  ["export const f = Intl.DateTimeFormat;\n", "Intl"],
  ['export const v: unknown = eval("1");\n', "eval"],
  ['export const f = new Function("return 1");\n', "Function"],
  ['export const m = import("./y.js");\n', "import()"],
  ["export const r = new WeakRef({});\n", "WeakRef"],
  ['console.log("x");\n', "console"],
  ['import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n', "node:fs"],
  ['import { join } from "path";\nexport const j = join;\n', "path"],
  ['import { randomBytes } from "node:crypto";\nexport const r = randomBytes;\n', "node:crypto randomBytes"],
  ['import * as c from "node:crypto";\nexport const h = c.createHash;\n', "node:crypto as a whole; name what it uses"],
];

// The lib and @types files every program of the run shares are parsed and
// bound here, not in the first case: under the load of the whole run that
// takes longer than the timeout of a test.
beforeAll(() => {
  alone("src/trust/x.ts", "").program().getTypeChecker();
}, 30_000);

describe("purity: refused in pure code (ST-04)", () => {
  for (const [code, use] of REFUSED) {
    it(`ST-04: refuses ${use}`, () => {
      expect(inTrust(code)).toEqual([refusal(use)]);
    });
  }
});

describe("purity: the kernel (KR-02)", () => {
  it("KR-02: names the kernel's own rule for impure kernel code", () => {
    const problems = auditPurity(alone("src/kernel/x.ts", "export const now = () => Date.now();\n"));
    expect(problems).toEqual([refusal("Date.now", 1, "KR-02", "src/kernel/x.ts")]);
  });
});

describe("purity: allowed", () => {
  it("ST-04: passes the allowed names of node:crypto, Date with an argument and UTC", () => {
    const code = [
      'import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";',
      'export const h = createHash("sha256").update("x").digest("hex");',
      "export const v = [verify, sign, createPublicKey, createPrivateKey];",
      "export const d = new Date(0).toISOString();",
      "export const u = Date.UTC(2026, 9, 6) + new Date(0).getUTCHours();",
      'export const up = "a".toUpperCase();',
      "",
    ].join("\n");
    expect(inTrust(code)).toEqual([]);
  });

  it("ST-04: passes a local binding or a property that shares a refused name", () => {
    const code = [
      "const process = (n: number) => n + 1;",
      "export const p = process(1);",
      "export const o = { console: 1, fetch: 2 };",
      "export const q = o.console + o.fetch;",
      "export function run({ setTimeout }: { setTimeout: number }) {",
      "  return { setTimeout };",
      "}",
      "",
    ].join("\n");
    expect(inTrust(code)).toEqual([]);
  });

  it("ST-04: passes impure modules", () => {
    for (const path of ["src/cli/x.ts", "src/assembly/x.ts", "src/adapters/clock-system/index.ts"]) {
      expect(auditPurity(alone(path, "export const t = Date.now() + Math.random();\nconsole.log(process.argv);\n"))).toEqual([]);
    }
  });
});

describe("purity: no state at module level (ST-04, KR-02)", () => {
  const state = (decl: string, line = 1, rule = "ST-04", path = "src/trust/x.ts") =>
    `${rule}: ${path}:${line} keeps state at module level (${decl}); pure code keeps no state between calls`;

  it("ST-04: refuses let and var at module level, exported or not", () => {
    const code = ["let n = 0;", "export var m = 1;", "export let k: number | undefined;", "export const next = () => ++n + m + (k ?? 0);", ""].join("\n");
    expect(inTrust(code)).toEqual([state("let n"), state("var m", 2), state("let k", 3)]);
  });

  it("KR-02: names the kernel's own rule for state in the kernel", () => {
    expect(auditPurity(alone("src/kernel/x.ts", "export let seen = 0;\n"))).toEqual([state("let seen", 1, "KR-02", "src/kernel/x.ts")]);
  });

  it("ST-04: passes const at module level, let inside a function and state in impure modules", () => {
    const code = ["export const one = 1;", "export function count(xs: readonly number[]): number {", "  let n = 0;", "  for (const x of xs) n += x;", "  return n;", "}", ""].join("\n");
    expect(inTrust(code)).toEqual([]);
    expect(auditPurity(alone("src/adapters/clock-system/index.ts", "let ticks = 0;\nexport const tick = () => ++ticks;\n"))).toEqual([]);
  });
});
