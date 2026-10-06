// ST-01, ST-04, ST-06, PR-13: trigger cases change one file of a tree that
// holds every rule and expect exactly the problems the change makes.
import { describe, expect, it } from "vitest";
import { auditImports } from "./audit-imports.js";
import { tree } from "./cases.js";

const exportOne = "export const x = 1;\n";

describe("imports: the base tree", () => {
  it("ST-01, ST-04, ST-06: passes the base tree, which holds every rule", () => {
    expect(auditImports(tree())).toEqual([]);
  });
});

describe("imports: direction and entries (ST-01)", () => {
  it("ST-01: refuses kernel importing ledger, which also closes a cycle", () => {
    const t = tree({ "src/kernel/index.ts": 'import { ledger } from "../ledger/index.js";\nexport const kernel = ledger;\n' });
    expect(auditImports(t)).toEqual([
      "ST-01: src/kernel/index.ts:1 imports ledger; kernel may import no other module",
      "ST-04: import cycle among src/kernel/index.ts, src/ledger/index.ts, src/trust/index.ts",
    ]);
  });

  it("ST-01: refuses cli importing anything but assembly", () => {
    const t = tree({ "src/cli/main.ts": 'import { ledger } from "../ledger/index.js";\nexport const y = ledger;\n' });
    expect(auditImports(t)).toEqual(["ST-01: src/cli/main.ts:1 imports ledger; cli may import assembly"]);
  });

  it("ST-01: refuses an import of a file that is not an entry of its module", () => {
    const t = tree({
      "src/ledger/fold.ts": exportOne,
      "src/codec/index.ts": 'import { x } from "../ledger/fold.js";\nexport const y = x;\n',
    });
    expect(auditImports(t)).toEqual(["ST-01: src/codec/index.ts:1 imports src/ledger/fold.ts, which is not an entry of ledger"]);
  });

  it("ST-01: refuses a file in no module and an import of a file that does not exist", () => {
    const t = tree({ "src/misc/x.ts": exportOne, "src/trust/y.ts": 'import { x } from "./missing.js";\nexport const y = x;\n' });
    expect(auditImports(t)).toEqual([
      "ST-01: src/misc/x.ts is in no module of ST-01",
      "ST-01: src/trust/y.ts:1 imports ./missing.js, which is no file of src/",
    ]);
  });
});

describe("imports: adapters and their ports (ST-01, ST-04, ST-06)", () => {
  it("ST-04: refuses an adapter importing another adapter", () => {
    const t = tree({
      "src/adapters/git-fixture/index.ts": 'import { store } from "../store-memory/index.js";\nexport const git = store;\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-04: src/adapters/git-fixture/index.ts:1 imports adapter store-memory; adapters never import each other",
    ]);
  });

  it("ST-01: refuses an adapter importing a port it does not implement, or a module", () => {
    const t = tree({
      "src/adapters/store-memory/index.ts":
        'import type { Git } from "../../ledger/ports/git.js";\nimport { kernel } from "../../kernel/index.js";\nexport const s: Git = { head: String(kernel) };\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-01: src/adapters/store-memory/index.ts:1 imports ledger/ports/git; adapter store-memory may import only the port interface it implements",
      "ST-01: src/adapters/store-memory/index.ts:2 imports kernel; adapter store-memory may import only the port interface it implements",
    ]);
  });

  it("ST-01: refuses an adapter folder that names no port", () => {
    expect(auditImports(tree({ "src/adapters/cache-memory/index.ts": exportOne }))).toEqual([
      "ST-01: adapter cache-memory names no port of ledger/ports or runtime/ports",
    ]);
  });

  it("ST-06: refuses an adapter imported outside assembly", () => {
    const t = tree({ "src/ledger/index.ts": 'import { store } from "../adapters/store-memory/index.js";\nexport const ledger = store;\n' });
    expect(auditImports(t)).toEqual(["ST-06: src/ledger/index.ts:1 imports adapter store-memory; only assembly imports adapters"]);
  });

  it("ST-06: refuses codec and generate imported outside assembly and cli; cli still imports only assembly (G-15)", () => {
    const t = tree({
      "src/codec/index.ts": exportOne,
      "src/generate/index.ts": exportOne,
      "src/ledger/index.ts": 'import { x } from "../codec/index.js";\nexport const ledger = x;\n',
      "src/trust/index.ts": 'import { x } from "../generate/index.js";\nexport const trust = x;\n',
      "src/cli/main.ts": 'import { x } from "../codec/index.js";\nexport const y = x;\n',
    });
    expect(auditImports(t)).toEqual([
      "ST-01: src/cli/main.ts:1 imports codec; cli may import assembly",
      "ST-06: src/ledger/index.ts:1 imports codec; only assembly and cli import codec and generate",
      "ST-06: src/trust/index.ts:1 imports generate; only assembly and cli import codec and generate",
    ]);
  });
});

describe("imports: parts of ledger and runtime (ST-01)", () => {
  const runtime = (spec: string) => tree({ "src/runtime/index.ts": `import { x } from "${spec}";\nexport const y = x;\n` });
  const parts = { "src/ledger/view.ts": exportOne, "src/ledger/ports/clock.ts": exportOne };

  it("ST-01: lets runtime import the read view and the clock port of ledger", () => {
    expect(auditImports(tree({ ...parts, "src/runtime/index.ts": 'import { x } from "../ledger/view.js";\nexport const y = x;\n' }))).toEqual([]);
    expect(auditImports(tree({ ...parts, "src/runtime/index.ts": 'import { x } from "../ledger/ports/clock.js";\nexport const y = x;\n' }))).toEqual([]);
  });

  it("ST-01: refuses runtime importing the whole ledger or its store port", () => {
    expect(auditImports(runtime("../ledger/index.js"))).toEqual([
      "ST-01: src/runtime/index.ts:1 imports ledger; runtime may import kernel, evidence, ledger/view, ledger/runtime-append, ledger/tape, ledger/ports/clock, ledger/ports/ids",
    ]);
    expect(auditImports(runtime("../ledger/ports/store.js"))[0]).toMatch(/^ST-01: src\/runtime\/index.ts:1 imports ledger\/ports\/store;/);
  });
});
