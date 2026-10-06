// ST-04, DP-14, PR-13: the judge port, vendor SDKs, code of another project
// and cycles — trigger cases on a tree that holds every rule.
import { describe, expect, it } from "vitest";
import { auditImports } from "./audit-imports.js";
import { tree } from "./cases.js";

const exportOne = "export const x = 1;\n";
const judge = { "src/runtime/ports/judge.ts": exportOne, "src/runtime/ports/llm.ts": exportOne };

describe("boundaries: the judge port (ST-04, DP-14)", () => {
  it("lets decide, the judge adapters and assembly import the judge port", () => {
    const t = tree({
      ...judge,
      "src/capabilities/decide/index.ts": 'import { x } from "../../runtime/ports/judge.js";\nexport const y = x;\n',
      "src/adapters/judge-fixture/index.ts": 'import { x } from "../../runtime/ports/judge.js";\nexport const y = x;\n',
      "src/assembly/judge.ts": 'import { x } from "../runtime/ports/judge.js";\nexport const y = x;\n',
    });
    expect(auditImports(t)).toEqual([]);
  });

  it("ST-04: refuses the judge port anywhere else, its own module included", () => {
    const t = tree({
      ...judge,
      "src/capabilities/index.ts": 'import { x } from "../runtime/ports/judge.js";\nimport { x as l } from "../runtime/ports/llm.js";\nexport const y = [x, l];\n',
      "src/runtime/index.ts": 'import { x } from "./ports/judge.js";\nexport const y = x;\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-04: src/capabilities/index.ts:1 imports the judge port; only decide receives it (DP-14)",
      "ST-04: src/runtime/index.ts:1 imports the judge port; only decide receives it (DP-14)",
    ]);
  });
});

describe("boundaries: vendor SDKs and other projects (ST-04, PR-13)", () => {
  const sdk = 'import { ulid } from "ulid";\nexport const id = ulid;\n';

  it("lets one adapter import a declared package", () => {
    expect(auditImports(tree({ "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": sdk }, ["ulid"]))).toEqual([]);
  });

  it("ST-04: refuses a package outside adapters", () => {
    expect(auditImports(tree({ "src/ledger/ids.ts": sdk }, ["ulid"]))).toEqual([
      "ST-04: src/ledger/ids.ts:1 imports ulid; a vendor SDK lives only inside its adapter",
    ]);
  });

  it("ST-04: refuses one package in two adapters", () => {
    const t = tree({ "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": sdk, "src/adapters/store-memory/ulid.ts": sdk }, ["ulid"]);
    expect(auditImports(t)).toEqual(["ST-04: ulid is imported by adapters ids-ulid, store-memory; a vendor SDK lives inside one adapter"]);
  });

  it("PR-13: refuses a package package.json does not declare and code outside src/", () => {
    const t = tree({
      "src/ledger/ports/ids.ts": exportOne,
      "src/adapters/ids-ulid/index.ts": 'import { ulid } from "@acme/ulid/fast";\nexport const id = ulid;\n',
      "src/trust/index.ts": 'import { x } from "../../../other-project/src/x.js";\nexport const trust = x;\n',
    });
    expect(auditImports(t)).toEqual([
      "PR-13: src/adapters/ids-ulid/index.ts:1 imports @acme/ulid, which package.json does not declare in dependencies",
      "PR-13: src/trust/index.ts:1 imports ../../../other-project/src/x.js outside src/; another project's code comes only as a pinned library",
    ]);
  });

  it("ST-04: refuses an import() of a computed specifier, which nothing can check", () => {
    const t = tree({ "src/assembly/load.ts": "export const load = (name: string) => import(name);\n" });
    expect(auditImports(t)).toEqual(["ST-04: src/assembly/load.ts:1 imports a computed specifier, which the structure test cannot check"]);
  });

  it("lets impure modules import node: modules", () => {
    expect(auditImports(tree({ "src/cli/io.ts": 'import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n' }))).toEqual([]);
  });
});

describe("boundaries: cycles (ST-04)", () => {
  it("ST-04: refuses a cycle of files inside one module and a file importing itself", () => {
    const t = tree({
      "src/ledger/a.ts": 'import { b } from "./b.js";\nexport const a = () => b;\n',
      "src/ledger/b.ts": 'import { a } from "./a.js";\nexport const b = () => a;\n',
      "src/trust/self.ts": 'import { s } from "./self.js";\nexport const s = () => s;\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-04: import cycle among src/ledger/a.ts, src/ledger/b.ts",
      "ST-04: import cycle among src/trust/self.ts",
    ]);
  });
});
