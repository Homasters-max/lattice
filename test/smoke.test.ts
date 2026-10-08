import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import config, { owners, projectsOf, strays, testFiles } from "../vitest.config.js";

describe("toolchain", () => {
  it("runs a property with fast-check", () => {
    fc.assert(fc.property(fc.string(), (s) => s.length >= 0), { numRuns: 100 });
    expect(true).toBe(true);
  });
});

// ST-12: the fitness tests run on every change request. The run is split into projects of vitest (S0-40):
// `tools` holds the tests of the development tools, `lattice` the rest; `npm test` runs every project,
// and every test file of test/ belongs to exactly one of them, so the split drops no test.
// vitest.config.ts refuses to load otherwise (test/vitest-config.test.ts); these tests show that check on the projects vitest gets.
const root = join(import.meta.dirname, "..");
const projects = projectsOf(config);
const files = testFiles(root);

describe("toolchain, projects of the test run", () => {
  it("ST-12: npm test runs every project", () => {
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: { [name: string]: string } }).scripts;
    expect(scripts.test).toBe("vitest run");
    expect(projects.map((p) => p.name).sort()).toEqual(["lattice", "tools"]);
  });

  it("ST-12: every test file of test/ belongs to exactly one project", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(strays(files, projects)).toEqual([]);
  });

  it("ST-12: a test file dropped from its project, or put in two, is a stray", () => {
    const dropped = projects.map((p) => (p.name === "lattice" ? { ...p, exclude: [...p.exclude, "test/smoke.test.ts"] } : p));
    const twice = projects.map((p) => (p.name === "tools" ? { ...p, include: [...p.include, "test/smoke.test.ts"] } : p));
    expect(strays(files, dropped)).toEqual(["test/smoke.test.ts"]);
    expect(strays(files, twice)).toEqual(["test/smoke.test.ts"]);
  });

  it("puts in tools the tests of test/tools/ and no other", () => {
    expect(files.filter((f) => owners(f, projects).includes("tools"))).toEqual(files.filter((f) => f.startsWith("test/tools/")));
  });
});
