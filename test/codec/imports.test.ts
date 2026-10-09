// The codec imports the kernel and, for the type of an intent, the ledger
// (S0-25, S0-26): ST-01 lets it import ledger whole, so the matrix test would
// not see a value of ledger here; this test does — import builds intents as
// data, with no code of the ledger. Purity (ST-04) is the structure test's.
import { describe, expect, it } from "vitest";
import { importsOf } from "../structure/imports.js";
import { repoTree } from "../structure/tree.js";

describe("the imports of the codec", () => {
  it("S0-25, S0-26: every import of src/codec/ is the kernel's entry, a file of the codec or a type of the ledger's entry", () => {
    const files = [...repoTree().files].filter(([path]) => path.startsWith("src/codec/"));
    const imports = files.flatMap(([path, sf]) => importsOf(path, sf));
    const allowed = (i: (typeof imports)[number]) =>
      i.target === "src/kernel/index.ts" || (i.target ?? "").startsWith("src/codec/") || (i.target === "src/ledger/index.ts" && i.typeOnly);
    expect(files.length).toBeGreaterThan(0);
    expect(imports.filter((i) => !allowed(i)).map((i) => `${i.file}:${i.line} ${i.specifier}`)).toEqual([]);
  });
});
