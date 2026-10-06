// ST-05, KR-01: the files reachable from the kernel entry are listed, and
// the kernel names no `std` type.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditKernelFiles, auditStdNames, stdTypeNames } from "./audit-kernel.js";
import { BASE_KERNEL, tree } from "./cases.js";
import { repoRoot } from "./tree.js";

const NAMES = new Set(["requirement", "namespace", "act"]);

describe("kernel perimeter (ST-05)", () => {
  it("passes a reach equal to its list", () => {
    expect(auditKernelFiles(tree(), BASE_KERNEL)).toEqual([]);
  });

  it("ST-05: refuses a file added to the reach without the list", () => {
    const t = tree({ "src/kernel/index.ts": 'export { extra } from "./extra.js";\n', "src/kernel/extra.ts": "export const extra = 1;\n" });
    expect(auditKernelFiles(t, BASE_KERNEL)).toEqual([
      "ST-05: src/kernel/extra.ts is reachable from the kernel entry but not listed in test/structure/kernel-files.txt",
    ]);
  });

  it("ST-05: refuses a listed file the entry no longer reaches, and a missing entry", () => {
    expect(auditKernelFiles(tree(), [...BASE_KERNEL, "src/kernel/gone.ts"])).toEqual([
      "ST-05: src/kernel/gone.ts is listed in test/structure/kernel-files.txt but not reachable from the kernel entry",
    ]);
    expect(auditKernelFiles(tree({ "src/kernel/index.ts": null }), BASE_KERNEL)).toEqual(["ST-05: no kernel entry src/kernel/index.ts"]);
  });

  it("ST-05: counts a file of another module that the kernel reaches", () => {
    const t = tree({ "src/kernel/index.ts": 'import type { Store } from "../ledger/ports/store.js";\nexport type S = Store;\n' });
    expect(auditKernelFiles(t, BASE_KERNEL)).toEqual([
      "ST-05: src/ledger/ports/store.ts is reachable from the kernel entry but not listed in test/structure/kernel-files.txt",
    ]);
  });
});

describe("std type names in the kernel (KR-01)", () => {
  it("KR-01: refuses a std reference and a bare std type name in kernel code", () => {
    const t = tree({ "src/kernel/index.ts": 'export const a = "std/requirement@1";\nexport const b = `namespace`;\nexport const c = `std/${a}`;\n' });
    expect(auditStdNames(t, NAMES)).toEqual([
      'KR-01: src/kernel/index.ts:1 names the std type "std/requirement@1"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:2 names the std type "namespace"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:3 names the std type "std/"; the kernel knows no std type',
    ]);
  });

  it("KR-01: refuses an identifier, a type or a property named after a std type, alone or as whole words of a compound name", () => {
    const t = tree({
      "src/kernel/index.ts": "export type Requirement = { readonly reviewNote: number };\nexport const NAMESPACE = 1;\nexport const isRequirement = 2;\n",
    });
    expect(auditStdNames(t, new Set([...NAMES, "review-note"]))).toEqual([
      'KR-01: src/kernel/index.ts:1 names the std type "Requirement"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:1 names the std type "reviewNote"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:2 names the std type "NAMESPACE"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:3 names the std type "isRequirement"; the kernel knows no std type',
    ]);
  });

  it("passes words inside a sentence and std names outside the kernel", () => {
    const t = tree({
      "src/kernel/index.ts": 'export const m = "an entity id is namespace/slug";\n',
      "src/ledger/index.ts": 'export const t = "std/namespace@1";\n',
    });
    expect(auditStdNames(t, NAMES)).toEqual([]);
  });

  it("reads the std type names of TY-Z02…TY-Z05, not the core ones", () => {
    const names = stdTypeNames(readFileSync(join(repoRoot, "docs/design/03-types.md"), "utf8"));
    for (const n of ["knowledge", "hint", "requirement", "review-note", "namespace", "test-set", "act", "retired", "source-listing", "code-commit"]) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain("session");
    expect(names).not.toContain("core");
  });
});
