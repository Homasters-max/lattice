// The structure test over this repository (ST-04…ST-06, ST-05, KR-01,
// SL-05, LG-23): every audit is empty, the module folders are those of the
// slice, the ledger has the ports of S0, and the lists are well-formed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { auditImports, portEntries } from "./audit-imports.js";
import { auditKernelFiles, auditStdNames, stdTypeNames } from "./audit-kernel.js";
import { auditPurity } from "./audit-purity.js";
import { SLICE_MODULES } from "./modules.js";
import { repoRoot, repoTree, type Tree } from "./tree.js";

const lines = (file: string) =>
  readFileSync(join(repoRoot, file), "utf8")
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("#"));

let repo: Tree;
beforeAll(() => {
  repo = repoTree();
});

describe("structure of this repository", () => {
  it("ST-01, ST-04, ST-06, PR-13: the imports of src/ hold the matrix", () => {
    expect(auditImports(repo)).toEqual([]);
  });

  it("ST-04, KR-02: code outside adapters, assembly and cli is pure", () => {
    expect(auditPurity(repo)).toEqual([]);
  });

  it("ST-05: the reach of the kernel entry is test/structure/kernel-files.txt", () => {
    expect(auditKernelFiles(repo, lines("test/structure/kernel-files.txt"))).toEqual([]);
  });

  it("KR-01: the kernel names no std type", () => {
    const names = new Set(stdTypeNames(readFileSync(join(repoRoot, "docs/design/03-types.md"), "utf8")));
    expect(auditStdNames(repo, names)).toEqual([]);
  });

  it("SL-05: src/ has exactly the module folders of the slice", () => {
    const dirs = readdirSync(join(repoRoot, "src")).filter((d) => statSync(join(repoRoot, "src", d)).isDirectory());
    expect(dirs.sort()).toEqual([...SLICE_MODULES].sort());
  });

  it("LG-23: the ledger has the ports store, acts, git, clock and ids", () => {
    expect(portEntries(repo).sort()).toEqual(["ledger/ports/acts", "ledger/ports/clock", "ledger/ports/git", "ledger/ports/ids", "ledger/ports/store"]);
  });
});

describe("lists of the structure test", () => {
  for (const file of ["test/structure/kernel-files.txt", "test/structure/skeleton-files.txt"]) {
    it(`${file} is sorted, without duplicates, and every file in it exists`, () => {
      const list = lines(file);
      expect(list).toEqual([...new Set(list)].sort());
      expect(list.filter((f) => !existsSync(join(repoRoot, f)))).toEqual([]);
    });
  }
});
