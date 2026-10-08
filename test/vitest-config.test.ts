import { describe, expect, it, vi } from "vitest";

// ST-12: vitest.config.ts does not load while a test file of test/ is outside every project or in two of them.
// This test is a file of its own, not a case of test/smoke.test.ts: an exclude that drops the smoke test
// and the check of the config in one change still leaves this test in the run.
// The config is loaded anew with one more file under test/: test/node_modules/ is in the exclude of `lattice`
// (configDefaults) and outside the include of `tools`, so the file belongs to no project.
const load = async (extra: readonly string[]): Promise<unknown> => {
  vi.resetModules();
  vi.doMock("node:fs", async (original) => {
    const fs = await original<typeof import("node:fs")>();
    // the one call of the config: readdirSync(join(root, "test"), { recursive: true, encoding: "utf8" })
    const readdirSync = (path: string, options: { recursive: true; encoding: "utf8" }): string[] => [...fs.readdirSync(path, options), ...extra];
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
});
