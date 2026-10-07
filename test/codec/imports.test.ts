// The codec imports only the kernel (S0-25): ST-01 lets it import ledger too,
// so the matrix test would not see an import of ledger here; this test does.
// Purity (ST-04) is the structure test's.
import { describe, expect, it } from "vitest";
import { importsOf } from "../structure/imports.js";
import { repoTree } from "../structure/tree.js";

describe("the imports of the codec", () => {
  it("S0-25: every import of src/codec/ is the kernel's entry or a file of the codec", () => {
    const files = [...repoTree().files].filter(([path]) => path.startsWith("src/codec/"));
    const imports = files.flatMap(([path, sf]) => importsOf(path, sf));
    const other = imports.filter((i) => i.target !== "src/kernel/index.ts" && !(i.target ?? "").startsWith("src/codec/"));
    expect(files.length).toBeGreaterThan(0);
    expect(other.map((i) => `${i.file}:${i.line} ${i.specifier}`)).toEqual([]);
  });
});
