// A run of the tests is a function of its input (ST-12; RT-21 after S0-39;
// S0-41): fast-check draws from one seed — `LATTICE_SEED`, or a fixed one
// without it — every property names its budget of cases, and no test takes
// the default timeout of vitest: time is a safeguard set above the budget.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED, SAFEGUARD_MS, seedOf } from "../support/budget.js";
import { repoRoot } from "./tree.js";

/** A call `fc.assert(…)` or `fc.check(…)`: a run of a property. */
const isRun = (node: ts.Node, file: ts.SourceFile): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  ["assert", "check"].includes(node.expression.name.text) &&
  node.expression.expression.getText(file) === "fc";

/** The parameters of a run name `numRuns`: its budget is counted in cases. */
const counted = (call: ts.CallExpression, file: ts.SourceFile): boolean => {
  const params = call.arguments[1];
  return params !== undefined && ts.isObjectLiteralExpression(params) && params.properties.some((p) => p.name?.getText(file) === "numRuns");
};

/** `path:line` of each run of a property whose parameters do not name `numRuns`. */
function unbudgeted(path: string, text: string): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2023, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isRun(node, file) && !counted(node, file)) found.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`);
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

  it("draws the same cases twice", () => {
    const draw = () => fc.sample(fc.array(fc.string()), 20);
    expect(draw()).toEqual(draw());
  });
});

describe("the time of a test", () => {
  it("is the safeguard, not the default timeout of vitest", ({ task }) => {
    expect(task.timeout).toBe(SAFEGUARD_MS);
  });
});

describe("the budget of a property", () => {
  it("is named by numRuns in every run of a property", () => {
    expect(unbudgeted("x.test.ts", "fc.assert(fc.property(fc.nat(), (n) => n >= 0));\n")).toEqual(["x.test.ts:1"]);
    expect(unbudgeted("x.test.ts", "const p = fc.property(fc.nat(), (n) => n >= 0);\nfc.check(p, { seed: 1 });\n")).toEqual(["x.test.ts:2"]);
    expect(unbudgeted("x.test.ts", "fc.assert(fc.property(fc.nat(), (n) => n >= 0), { numRuns: 100 });\n")).toEqual([]);
  });

  it("every property test of the repository names its numRuns", () => {
    const paths = readdirSync(join(repoRoot, "test"), { recursive: true, encoding: "utf8" })
      .map((p) => `test/${p.replaceAll("\\", "/")}`)
      .filter((p) => p.endsWith(".ts"))
      .sort();
    expect(paths.flatMap((p) => unbudgeted(p, readFileSync(join(repoRoot, p), "utf8")))).toEqual([]);
  });
});
