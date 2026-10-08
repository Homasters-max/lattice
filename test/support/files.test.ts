// The helpers of ST-18 hold its line at run time too: owned refuses a file its test set does not own, a scratch folder
// refuses a path outside it, and program refuses what is no program of the project nor a tool of the environment.
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { currentTestSet, knowledge, owned, scratch } from "./files.js";
import { program } from "./program.js";

const own = scratch("lattice-files-");
afterAll(() => own.remove());

describe("owned (ST-18)", () => {
  it("ST-18: the test set of this file is support, by its folder", () => {
    expect(currentTestSet()).toBe("support");
  });

  it("ST-18: reads a file its test set owns", () => {
    expect(owned.text("test/support/files.ts")).toContain("export const owned");
    expect(owned.list("test/support")).toContain("files.ts");
  });

  it("ST-18: refuses a file its test set does not own", () => {
    expect(() => owned.text("src/kernel/index.ts")).toThrow("ST-18: test set support does not own src/kernel/index.ts; a test reads only the files its test set owns (scripts/paths.mjs)");
    expect(() => owned.list("src")).toThrow("ST-18: test set support does not own src");
  });

  it("ST-18: refuses a path outside the repository", () => {
    expect(() => owned.text("test/../../x.txt")).toThrow("ST-18: test/../../x.txt is outside the repository");
    expect(() => program("../x.mjs")).toThrow("ST-18: ../x.mjs is outside the repository");
  });
});

describe("knowledge (ST-18)", () => {
  it("ST-18: reads the design", () => {
    expect(knowledge.list("")).toContain("13-structure.md");
    expect(knowledge.text("13-structure.md")).toContain("| ST-18 |");
  });

  it("ST-18: refuses a path outside docs/design", () => {
    expect(() => knowledge.text("../../package.json")).toThrow("ST-18: ../../package.json is outside docs/design; knowledge is the design");
  });
});

describe("scratch (ST-18)", () => {
  it("ST-18: reads back what the test wrote, by a path inside it or absolute", () => {
    const file = own.write("a/b.txt", "x\n");
    expect([own.text("a/b.txt"), own.text(file), own.list("a"), own.exists("a/b.txt"), own.isDirectory("a")]).toEqual(["x\n", "x\n", ["b.txt"], true, true]);
    own.remove("a");
    expect(own.exists("a")).toBe(false);
  });

  it("ST-18: refuses a path outside every scratch folder of the run", () => {
    const outside = join(own.dir, "..", "elsewhere.txt");
    expect(() => own.text(outside)).toThrow(`ST-18: ${outside} is not in a scratch folder of this run; a test reads what it wrote itself only there`);
  });
});

describe("program (ST-18)", () => {
  it("ST-18: runs a program of this project and a tool of the environment", async () => {
    expect(program("scripts/paths.mjs").run([]).status).toBe(0);
    expect((await program("git").start(["--version"])).stdout).toMatch(/^git version /);
    expect(program("tsc").run(["--version"]).stdout).toMatch(/^Version /);
  });

  it("ST-18: refuses what is no program of this project nor a tool of the environment", () => {
    expect(() => program("curl")).toThrow("ST-18: curl is no program of this project nor a tool its environment names (git, tsc)");
    expect(() => program("node_modules/typescript/bin/tsc")).toThrow("ST-18: node_modules/typescript/bin/tsc is a dependency, no program of this project");
    expect(() => program(join(own.dir, "..", "x.mjs"))).toThrow("is not in a scratch folder of this run");
  });
});
