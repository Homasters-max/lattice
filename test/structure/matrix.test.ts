// ST-01: the matrix of modules is the table of the design, and every pair
// importer → target is allowed exactly when the matrix grants it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditImports } from "./audit-imports.js";
import { MATRIX, MODULES, type Module } from "./modules.js";
import { repoRoot, virtualTree } from "./tree.js";

/** The rows of the module table of ST-01: module → the modules its «May import» cell names. */
function designMatrix(): Map<string, string[] | "port"> {
  const md = readFileSync(join(repoRoot, "docs/design/13-structure.md"), "utf8");
  const table = md.slice(md.indexOf("| Module | Holds | May import |")).split("\n\n")[0] ?? "";
  const rows = new Map<string, string[] | "port">();
  for (const row of table.split("\n").slice(2)) {
    const [module = "", , may = ""] = row.slice(2, -2).split(" | ");
    const name = module.replaceAll("`", "");
    if (may.startsWith("the port interface")) rows.set(name, "port");
    else if (may === "everything above") rows.set(name, [...rows.keys()]);
    else rows.set(name, [...may.replace(/\([^)]*\)/g, "").matchAll(/`([a-z]+)`/g)].map((m) => m[1] ?? ""));
  }
  return rows;
}

const modulesOf = (grants: readonly string[]) => [...new Set(grants.map((g) => g.split("/")[0] ?? ""))].sort();

describe("ST-01 matrix as data", () => {
  it("ST-01: names the twelve modules of the design in its order", () => {
    expect([...designMatrix().keys()]).toEqual([...MODULES]);
  });

  it("ST-01: grants each module the modules its row of the design names", () => {
    const design = designMatrix();
    for (const m of MODULES) {
      const row = design.get(m);
      if (row === "port") expect(MATRIX[m]).toEqual([]);
      else expect([m, modulesOf(MATRIX[m])]).toEqual([m, [...(row ?? [])].sort()]);
    }
  });

  it("ST-01: grants runtime and capabilities only the parts their rows name", () => {
    expect(MATRIX.runtime.filter((g) => g.startsWith("ledger"))).toEqual([
      "ledger/view",
      "ledger/runtime-append",
      "ledger/tape",
      "ledger/ports/clock",
      "ledger/ports/ids",
    ]);
    expect(MATRIX.capabilities).toEqual(["kernel", "measure", "runtime/ports", "ledger/view"]);
  });
});

const ADAPTER = "src/adapters/store-memory/index.ts";
const fileOf = (m: Module) => (m === "adapters" ? ADAPTER : `src/${m}/index.ts`);
const spec = (from: Module, to: Module) => `${from === "adapters" ? "../.." : ".."}/${fileOf(to).slice(4).replace(/\.ts$/, ".js")}`;

function pair(from: Module, to: Module): string[] {
  return auditImports(
    virtualTree({
      "src/ledger/ports/store.ts": "export const port = 1;\n",
      [fileOf(from)]: `import { x } from "${spec(from, to)}";\nexport const y = x;\n`,
      [fileOf(to)]: "export const x = 1;\n",
    }),
  );
}

describe("ST-01 every pair of modules", () => {
  for (const from of MODULES) {
    for (const to of MODULES.filter((m) => m !== from)) {
      const allowed = MATRIX[from].includes(to);
      it(`ST-01: ${from} ${allowed ? "may" : "may not"} import ${to}`, () => {
        expect(pair(from, to).length === 0).toBe(allowed);
      });
    }
  }
});
