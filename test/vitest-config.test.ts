import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import config, { checked, testFiles } from "../vitest.config.js";
import { owned } from "./support/files.js";

// ST-12: vitest.config.ts does not load while a test file of test/ is outside every project or in two of them.
// This test is a file of its own, not a case of test/smoke.test.ts: an exclude that drops the smoke test
// and the check of the config in one change still leaves this test in the run.
// The config is loaded anew with one more file under test/: test/node_modules/ is in the exclude of `lattice`
// (configDefaults) and outside the include of `tools`, so the file belongs to no project.
const load = async (extra: readonly string[]): Promise<unknown> => {
  vi.resetModules();
  vi.doMock("node:fs", async (original) => {
    const fs = await original<typeof import("node:fs")>();
    // the one call of the config: readdirSync(join(root, "test"), { recursive: true, encoding: "utf8" }); the files of
    // test/ come through owned (ST-18)
    const readdirSync = (): string[] => [...owned.list("test", { recursive: true }), ...extra];
    return { ...fs, readdirSync };
  });
  try {
    return await import("../vitest.config.js");
  } finally {
    vi.doUnmock("node:fs");
  }
};

describe("toolchain, vitest.config.ts", () => {
  it("ST-12: loads while every test file of test/ belongs to exactly one project", async () => {
    await expect(load([])).resolves.toHaveProperty("default");
  });

  it("ST-12: does not load while a test file of test/ belongs to no project", async () => {
    await expect(load(["node_modules/stray.test.ts"])).rejects.toThrow(/^ST-12: .*: test\/node_modules\/stray\.test\.ts$/);
  });

  // The config is built through checked(), so the check reads the object vitest gets: `extends: true` puts the include
  // and the exclude of the root `test` into every project, and one line there drops a file or puts it in two projects.
  it("ST-12: refuses an include or an exclude of the root test, which every project inherits", () => {
    const files = testFiles(join(import.meta.dirname, ".."));
    const root = (globs: { include?: string[]; exclude?: string[] }): typeof config => ({ ...config, test: { ...config.test, ...globs } });
    expect(checked(config, files)).toBe(config);
    expect(() => checked(root({ exclude: ["test/smoke.test.ts"] }), files)).toThrow(/^ST-12: .*: test\/smoke\.test\.ts$/);
    expect(() => checked(root({ include: ["test/smoke.test.ts"] }), files)).toThrow(/^ST-12: .*: test\/smoke\.test\.ts$/);
  });
});
