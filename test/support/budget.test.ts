// A run of the tests is a function of its input (ST-12; RT-21 after S0-39;
// S0-41): fast-check draws from one seed — `LATTICE_SEED`, or a fixed one
// without it — every property names its budget of cases and no seed of its
// own, and no test takes the default timeout of vitest: time is a safeguard
// set above the budget.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import config from "../../vitest.config.js";
import { DEFAULT_SEED, SAFEGUARD_MS, seedOf } from "./budget.js";
import { setup } from "./global-setup.js";
import { repoRoot } from "../structure/tree.js";

/** A call `fc.assert(…)` or `fc.check(…)`: a run of a property. */
const isRun = (node: ts.Node, file: ts.SourceFile): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  ["assert", "check"].includes(node.expression.name.text) &&
  node.expression.expression.getText(file) === "fc";

/** The parameters of a run name `numRuns` and no `seed` of their own: its budget is counted in cases, its seed is the run's. */
const inBudget = (call: ts.CallExpression, file: ts.SourceFile): boolean => {
  const params = call.arguments[1];
  const names = params !== undefined && ts.isObjectLiteralExpression(params) ? params.properties.map((p) => p.name?.getText(file)) : [];
  return names.includes("numRuns") && !names.includes("seed");
};

/** `path:line` of each run of a property that does not name `numRuns` or names a `seed` of its own. */
function unbudgeted(path: string, text: string): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isRun(node, file) && !inBudget(node, file)) found.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("the seed of a run", () => {
  it("is LATTICE_SEED, or a fixed seed without it", () => {
    expect(fc.readConfigureGlobal().seed).toBe(seedOf(process.env.LATTICE_SEED));
    expect(["", "42", "-2147483648", "2147483647"].map(seedOf)).toEqual([DEFAULT_SEED, 42, -2147483648, 2147483647]);
    expect(seedOf(undefined)).toBe(DEFAULT_SEED);
  });

  it("refuses a seed that is not a 32-bit integer rather than correcting it", () => {
    for (const text of ["x", "1.5", " 1", "0x10", "2147483648", "-2147483649"]) {
      expect(() => seedOf(text)).toThrow(`LATTICE_SEED is a 32-bit integer from -2147483648 to 2147483647, got "${text}"`);
    }
  });

  it("is printed once before any test, so a failed run names the seed that replays it", () => {
    expect(config.test?.globalSetup).toEqual(["test/support/global-setup.ts"]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      setup();
      expect(log.mock.calls).toEqual([[`LATTICE_SEED=${seedOf(process.env.LATTICE_SEED)} — set it to replay this run`]]);
    } finally {
      log.mockRestore();
    }
  });

  it("is set with the base size of the generators in every test file", () => {
    expect(config.test?.setupFiles).toEqual(["test/support/setup.ts"]);
    expect(fc.readConfigureGlobal().baseSize).toBe("small");
  });

  it("draws the same cases twice", () => {
    const draw = () => fc.sample(fc.array(fc.string()), 20);
    expect(draw()).toEqual(draw());
  });
});

describe("the time of a test", () => {
  it("is the safeguard, not the default timeout of vitest", ({ task }) => {
    expect(task.timeout).toBe(SAFEGUARD_MS);
  });

  it("of a hook is the same safeguard", () => {
    expect([config.test?.testTimeout, config.test?.hookTimeout]).toEqual([SAFEGUARD_MS, SAFEGUARD_MS]);
  });
});

describe("the budget of a property", () => {
  it("is named by numRuns in every run of a property, and the seed is the run's", () => {
    expect(unbudgeted("x.test.ts", "fc.assert(fc.property(fc.nat(), (n) => n >= 0));\n")).toEqual(["x.test.ts:1"]);
    expect(unbudgeted("x.test.ts", "const p = fc.property(fc.nat(), (n) => n >= 0);\nfc.check(p, { seed: 1 });\n")).toEqual(["x.test.ts:2"]);
    expect(unbudgeted("x.test.ts", "fc.assert(fc.property(fc.nat(), (n) => n >= 0), { numRuns: 100, seed: 7 });\n")).toEqual(["x.test.ts:1"]);
    expect(unbudgeted("x.test.ts", "fc.assert(fc.property(fc.nat(), (n) => n >= 0), { numRuns: 100 });\n")).toEqual([]);
  });

  it("every property test of the repository names its numRuns and takes the seed of the run", () => {
    const paths = readdirSync(join(repoRoot, "test"), { recursive: true, encoding: "utf8" })
      .map((p) => `test/${p.replaceAll("\\", "/")}`)
      .filter((p) => p.endsWith(".ts"))
      .sort();
    expect(paths.flatMap((p) => unbudgeted(p, readFileSync(join(repoRoot, p), "utf8")))).toEqual([]);
  });
});
