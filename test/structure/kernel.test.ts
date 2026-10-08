// ST-05, KR-01: the files reachable from the kernel entry are listed, and
// the kernel names no `std` type.
import { describe, expect, it } from "vitest";
import { knowledge } from "../support/files.js";
import { auditKernelFiles, auditStdNames, designTypeNames, stdTypeNames } from "./audit-kernel.js";
import { BASE_KERNEL, tree } from "./cases.js";

const NAMES = new Set(["requirement", "namespace", "act"]);

describe("kernel perimeter (ST-05)", () => {
  it("ST-05: passes a reach equal to its list", () => {
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
      "src/kernel/index.ts":
        "export type Requirement = { readonly reviewNote: number };\nexport const NAMESPACE = 1;\nexport const isRequirement = 2;\n" +
        "export const REVIEW_NOTE_COUNT = 3;\nexport type HTTPRequirement = 4;\nexport const toACTRecord = 5;\n",
    });
    expect(auditStdNames(t, new Set([...NAMES, "review-note"]))).toEqual([
      'KR-01: src/kernel/index.ts:1 names the std type "Requirement"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:1 names the std type "reviewNote"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:2 names the std type "NAMESPACE"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:3 names the std type "isRequirement"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:4 names the std type "REVIEW_NOTE_COUNT"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:5 names the std type "HTTPRequirement"; the kernel knows no std type',
      'KR-01: src/kernel/index.ts:6 names the std type "toACTRecord"; the kernel knows no std type',
    ]);
  });

  it("KR-01: passes words inside a sentence, a std name inside a longer word and std names outside the kernel", () => {
    const t = tree({
      "src/kernel/index.ts":
        'export const m = "an entity id is namespace/slug";\nexport const ACTION = 1;\nexport const namespacedId = 2;\nexport type HTTPActor = 3;\n',
      "src/ledger/index.ts": 'export const t = "std/namespace@1";\n',
    });
    expect(auditStdNames(t, NAMES)).toEqual([]);
  });

  it("KR-01: passes a name the platform declares and refuses the same word as a name the kernel gives", () => {
    const t = tree({ "src/kernel/index.ts": 'export const unit = "a".charCodeAt(0);\nexport const char = String.fromCharCode(unit);\nexport const code = 1;\n' });
    expect(auditStdNames(t, new Set(["code"]))).toEqual(['KR-01: src/kernel/index.ts:3 names the std type "code"; the kernel knows no std type']);
  });

  it("KR-01: reads the std type names from the sources of std, one per file named by its slug", () => {
    expect(stdTypeNames(["requirement.json", "act.json", "test-set.json", "README.md"])).toEqual(["act", "requirement", "test-set"]);
  });

  it("KR-01: reads the std type names of TY-Z02…TY-Z05, those without a source yet included, not the core ones", () => {
    const names = designTypeNames(knowledge.text("03-types.md"));
    for (const n of ["knowledge", "requirement", "review-note", "namespace-policy", "pipeline", "live", "verdict", "report", "source-listing", "step", "run", "question", "code-commit"]) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain("session");
    expect(names).not.toContain("core");
  });
});
