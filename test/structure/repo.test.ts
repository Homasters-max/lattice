// The structure test over this repository (ST-04…ST-06, ST-05, KR-01,
// SL-05, LG-23): every audit is empty, the module folders are those of the
// slice, the ledger has the ports of S0, and the lists are well-formed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
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

/** What a file of `src/` exports, as the checker sees it: the names, sorted, and the properties of a type by name. */
function exportsOf(tree: Tree, path: string) {
  const program = tree.program();
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(tree.files.get(path)?.fileName ?? "");
  const module = sf === undefined ? undefined : checker.getSymbolAtLocation(sf);
  if (sf === undefined || module === undefined) throw new Error(`bug: ${path} is no module of the program`);
  const exported = checker.getExportsOfModule(module);
  const named = (name: string) => {
    const symbol = exported.find((s) => s.name === name);
    if (symbol === undefined) throw new Error(`bug: ${path} exports no ${name}`);
    return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  };
  const names = (types: readonly ts.Type[]) => [...new Set(types.flatMap((t) => t.getProperties().map((p) => p.name)))].sort();
  return {
    names: exported.map((s) => s.name).sort(),
    /** The properties of an exported type. */
    type: (name: string) => names([checker.getDeclaredTypeOfSymbol(named(name))]),
    /** The properties of what an exported function returns. */
    returns: (name: string) => names(checker.getTypeOfSymbolAtLocation(named(name), sf).getCallSignatures().map((c) => c.getReturnType())),
  };
}

let repo: Tree;
// The program and its checker over all of src/ are built here, not in the
// first test that audits: under the load of the whole run that takes longer
// than the timeout of a test.
beforeAll(() => {
  repo = repoTree();
  repo.program().getTypeChecker();
}, 30_000);

describe("structure of this repository", () => {
  it("ST-01, ST-04, ST-06, PR-13: the imports of src/ hold the matrix", () => {
    expect(auditImports(repo)).toEqual([]);
  });

  it("ST-04, KR-02: code outside adapters, assembly and cli is pure", () => {
    expect(auditPurity(repo)).toEqual([]);
  });

  it("CONVENTIONS §9: src/ and test/support/ are written in English — no Cyrillic letter in code or comments", () => {
    const support = readdirSync(join(repoRoot, "test/support")).map((f) => [`test/support/${f}`, readFileSync(join(repoRoot, "test/support", f), "utf8")] as const);
    const texts = [...[...repo.files].map(([path, file]) => [path, file.text] as const), ...support];
    expect(texts.filter(([, text]) => /[Ѐ-ӿ]/u.test(text)).map(([path]) => path)).toEqual([]);
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

  it("ST-01, LG-38: the read view entry gives runtime and capabilities View and createView, which returns a View — no rows, no opening a store", () => {
    const entry = exportsOf(repo, "src/ledger/view.ts");
    expect(entry.names).toEqual(["View", "createView"]);
    expect(entry.returns("createView")).toEqual(entry.type("View"));
    expect(entry.type("View")).not.toContain("row");
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

  /** R9 of the plan: the port interfaces, the command table, the bin, the kernel version and the structure test — what SL-05 makes the skeleton create. Files every task fills by the plan are aside: kernel-files.txt (ST-05), the entries of the modules and the stubs of the command table. */
  function skeletonFiles(): string[] {
    const under = (dir: string) => readdirSync(join(repoRoot, dir)).map((f) => `${dir}/${f}`);
    return [
      ...under("src/ledger/ports"),
      "src/cli/commands.ts",
      "src/cli/main.ts",
      "src/kernel/version.ts",
      ...under("test/structure").filter((f) => f !== "test/structure/kernel-files.txt"),
    ].sort();
  }

  it("ST-15, SL-05: test/structure/skeleton-files.txt lists exactly the files the walking skeleton owns", () => {
    expect(lines("test/structure/skeleton-files.txt")).toEqual(skeletonFiles());
  });
});
