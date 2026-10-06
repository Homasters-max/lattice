// ST-04, DP-14, PR-13, ST-07: the judge port, vendor SDKs, code of another
// project, adapters for tests and cycles — trigger cases on a tree that holds
// every rule.
import { describe, expect, it } from "vitest";
import { auditImports } from "./audit-imports.js";
import { tree } from "./cases.js";

const exportOne = "export const x = 1;\n";
const judge = { "src/runtime/ports/judge.ts": exportOne, "src/runtime/ports/llm.ts": exportOne };

describe("boundaries: the judge port (ST-04, DP-14)", () => {
  it("ST-04, DP-14: lets decide and a judge adapter, which implements the port, import it; assembly wires the adapter without it", () => {
    const t = tree({
      ...judge,
      "src/capabilities/decide/index.ts": 'import { x } from "../../runtime/ports/judge.js";\nexport const decide = (judge: typeof x) => judge;\n',
      "src/capabilities/index.ts": 'export { decide } from "./decide/index.js";\n',
      "src/adapters/judge-claude/index.ts": 'import { x } from "../../runtime/ports/judge.js";\nexport const y = x;\n',
      "src/assembly/judge.ts": 'import { y } from "../adapters/judge-claude/index.js";\nimport { decide } from "../capabilities/index.js";\nexport const wired = decide(y);\n',
    });
    expect(auditImports(t)).toEqual([]);
  });

  it("ST-04: refuses the judge port anywhere else — assembly and the port's own module included", () => {
    const t = tree({
      ...judge,
      "src/capabilities/index.ts": 'import { x } from "../runtime/ports/judge.js";\nimport { x as l } from "../runtime/ports/llm.js";\nexport const y = [x, l];\n',
      "src/runtime/index.ts": 'import { x } from "./ports/judge.js";\nexport const y = x;\n',
      "src/assembly/judge.ts": 'import { x } from "../runtime/ports/judge.js";\nexport const y = x;\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-04: src/assembly/judge.ts:1 imports the judge port; only decide receives it (DP-14)",
      "ST-04: src/capabilities/index.ts:1 imports the judge port; only decide receives it (DP-14)",
      "ST-04: src/runtime/index.ts:1 imports the judge port; only decide receives it (DP-14)",
    ]);
  });
});

describe("boundaries: adapters for tests (ST-07)", () => {
  const ports = { "src/ledger/ports/acts.ts": exportOne, "src/ledger/ports/clock.ts": exportOne };
  const adapter = (name: string, port: string) => ({ [`src/adapters/${name}/index.ts`]: `import { x } from "../../ledger/ports/${port}.js";\nexport const a = x;\n` });

  it("ST-07: refuses a fixture or a deterministic adapter in src/, assembly included — only the test assembly in test/ uses one", () => {
    const t = tree({
      ...ports,
      ...adapter("acts-fixture", "acts"),
      ...adapter("clock-fixed", "clock"),
      "src/assembly/tests.ts": 'import { a } from "../adapters/acts-fixture/index.js";\nimport { a as c } from "../adapters/clock-fixed/index.js";\nexport const wired = [a, c];\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-07: src/assembly/tests.ts:1 imports adapter acts-fixture, which exists for tests; only the test assembly in test/ uses it",
      "ST-07: src/assembly/tests.ts:2 imports adapter clock-fixed, which exists for tests; only the test assembly in test/ uses it",
    ]);
  });

  it("ST-06, ST-07: lets assembly import a working adapter", () => {
    const t = tree({ ...ports, ...adapter("acts-local", "acts"), "src/assembly/acts.ts": 'import { a } from "../adapters/acts-local/index.js";\nexport const acts = a;\n' });
    expect(auditImports(t)).toEqual([]);
  });
});

describe("boundaries: the hash of a package (PR-13, Q-21)", () => {
  it("PR-13, Q-21: refuses a package package-lock.json does not pin at the declared version with a sha512 integrity", () => {
    const files = { "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": 'import { ulid } from "ulid";\nexport const id = ulid;\n' };
    const SHA512 = `sha512-${"A".repeat(86)}==`;
    const locks = [{}, { ulid: { version: "3.0.0", integrity: SHA512 } }, { ulid: { version: "3.0.1" } }, { ulid: { version: "3.0.1", integrity: "sha1-2jmP6zYSWxAJ0D7mHg7LkTgdoS8=" } }];
    for (const locked of locks) {
      expect(auditImports(tree(files, { ulid: "3.0.1" }, locked))).toEqual([
        "PR-13: src/adapters/ids-ulid/index.ts:1 imports ulid, which package-lock.json does not pin at 3.0.1 with a sha512 integrity",
      ]);
    }
    expect(auditImports(tree(files, { ulid: "3.0.1" }, { ulid: { version: "3.0.1", integrity: SHA512 } }))).toEqual([]);
  });
});

describe("boundaries: vendor SDKs and other projects (ST-04, PR-13)", () => {
  const sdk = 'import { ulid } from "ulid";\nexport const id = ulid;\n';
  const pinned = { ulid: "3.0.1" };

  it("ST-04, PR-13: lets one adapter import a package package.json pins to one version", () => {
    expect(auditImports(tree({ "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": sdk }, pinned))).toEqual([]);
  });

  it("ST-04: refuses a package outside adapters", () => {
    expect(auditImports(tree({ "src/ledger/ids.ts": sdk }, pinned))).toEqual([
      "ST-04: src/ledger/ids.ts:1 imports ulid; a vendor SDK lives only inside its adapter",
    ]);
  });

  it("ST-04: refuses one package in two adapters", () => {
    const t = tree({ "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": sdk, "src/adapters/store-memory/ulid.ts": sdk }, pinned);
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

  it("PR-13: refuses a package package.json declares by a range, a tag or a source, not one pinned version", () => {
    for (const version of ["^3.0.1", "~3.0.1", "3.x", "latest", ">=3.0.0", "github:ulid/javascript"]) {
      const t = tree({ "src/ledger/ports/ids.ts": exportOne, "src/adapters/ids-ulid/index.ts": sdk }, { ulid: version });
      expect(auditImports(t)).toEqual([`PR-13: src/adapters/ids-ulid/index.ts:1 imports ulid, which package.json declares as ${version}, not one pinned version`]);
    }
  });

  it("ST-04: refuses an import() of a computed specifier, which nothing can check", () => {
    const t = tree({ "src/assembly/load.ts": "export const load = (name: string) => import(name);\n" });
    expect(auditImports(t)).toEqual(["ST-04: src/assembly/load.ts:1 imports a computed specifier, which the structure test cannot check"]);
  });

  it("ST-04: lets impure modules import node: modules", () => {
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
