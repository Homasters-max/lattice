import { readdirSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import config from "../vitest.config.js";

describe("toolchain", () => {
  it("runs a property with fast-check", () => {
    fc.assert(fc.property(fc.string(), (s) => s.length >= 0), { numRuns: 100 });
    expect(true).toBe(true);
  });
});

// ST-12: the fitness tests run on every change request. The run is split into projects of vitest (S0-40):
// `tools` holds the tests of the development tools, `lattice` the rest; `npm test` runs every project,
// and every test file of test/ belongs to exactly one of them, so the split drops no test.
type Project = { readonly name: string; readonly include: readonly string[]; readonly exclude: readonly string[] };

const root = join(import.meta.dirname, "..");
const projects: readonly Project[] = (config.test?.projects ?? []).map((p) => {
  if (typeof p !== "object" || p instanceof Promise || p.test === undefined) throw new Error("bug: a project of vitest.config.ts is not written inline");
  const { name, include = [], exclude = [] } = p.test;
  return { name: typeof name === "string" ? name : "", include, exclude };
});

const testFiles = readdirSync(join(root, "test"), { recursive: true, encoding: "utf8" })
  .map((f) => `test/${f.replaceAll("\\", "/")}`)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

const owners = (file: string) =>
  projects.filter((p) => p.include.some((g) => matchesGlob(file, g)) && !p.exclude.some((g) => matchesGlob(file, g))).map((p) => p.name);

describe("toolchain, projects of the test run", () => {
  it("ST-12: npm test runs every project", () => {
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: { [name: string]: string } }).scripts;
    expect(scripts.test).toBe("vitest run");
    expect(projects.map((p) => p.name).sort()).toEqual(["lattice", "tools"]);
  });

  it("ST-12: every test file of test/ belongs to exactly one project", () => {
    expect(testFiles.length).toBeGreaterThan(0);
    expect(testFiles.filter((f) => owners(f).length !== 1)).toEqual([]);
  });

  it("puts in tools the tests of test/tools/ and no other", () => {
    expect(testFiles.filter((f) => owners(f).includes("tools"))).toEqual(testFiles.filter((f) => f.startsWith("test/tools/")));
  });
});
