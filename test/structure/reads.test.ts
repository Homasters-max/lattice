// ST-18: at run time a test reads only the files its test set owns, knowledge and what it wrote itself, and starts
// only programs of its project and the tools its environment names. The structure test checks it on every change
// request (ST-12): node:fs and node:child_process are imported in test/ only by the helpers of test/support/.
import { describe, expect, it } from "vitest";
import { owned } from "../support/files.js";
import { auditReads, READERS } from "./audit-reads.js";

const refusal = (path: string, line: number, specifier: string) =>
  `ST-18: ${path}:${line} imports ${specifier}; a test reads through owned, knowledge or scratch and starts programs through program (test/support/)`;

describe("reads of a test (ST-18): refused", () => {
  it("ST-18: refuses a test that reads a file with readFileSync of node:fs", () => {
    const code = 'import { readFileSync } from "node:fs";\nexport const a = readFileSync("docs/design/README.md", "utf8");\n';
    expect(auditReads("test/kernel/a.test.ts", code)).toEqual([refusal("test/kernel/a.test.ts", 1, "node:fs")]);
  });

  it("ST-18: refuses fs and its promises by any name, and a test that starts a process itself", () => {
    const code = [
      'import fs from "fs";',
      'import { readFile } from "node:fs/promises";',
      'export * from "fs/promises";',
      'import { spawnSync } from "node:child_process";',
      'export const m = () => import("child_process");',
      "export const all = [fs, readFile, spawnSync];",
      "",
    ].join("\n");
    expect(auditReads("test/ledger/b.test.ts", code)).toEqual([
      refusal("test/ledger/b.test.ts", 1, "fs"),
      refusal("test/ledger/b.test.ts", 2, "node:fs/promises"),
      refusal("test/ledger/b.test.ts", 3, "fs/promises"),
      refusal("test/ledger/b.test.ts", 4, "node:child_process"),
      refusal("test/ledger/b.test.ts", 5, "child_process"),
    ]);
  });

  it("ST-18: refuses a helper of a test set as it refuses a test", () => {
    expect(auditReads("test/fixtures/load.ts", 'import { existsSync } from "node:fs";\nexport const e = existsSync;\n')).toEqual([refusal("test/fixtures/load.ts", 1, "node:fs")]);
  });
});

describe("reads of a test (ST-18): passed", () => {
  it("ST-18: passes a test that reads through owned", () => {
    const code = 'import { owned } from "../support/files.js";\nexport const a = owned.text("test/kernel/a.json");\n';
    expect(auditReads("test/kernel/a.test.ts", code)).toEqual([]);
  });

  it("ST-18: passes a type of node:fs and the source of a program written as a string", () => {
    const code = [
      'import type { Stats } from "node:fs";',
      "export type S = Stats | typeof import(\"node:fs\");",
      'export const fake = \'import { readFileSync } from "node:fs";\\nconsole.log(readFileSync(0, "utf8"));\\n\';',
      "",
    ].join("\n");
    expect(auditReads("test/tools/c.test.ts", code)).toEqual([]);
  });

  it("ST-18: passes the helpers themselves", () => {
    for (const path of READERS) expect(auditReads(path, 'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n')).toEqual([]);
  });
});

describe("reads of the tests of this repository (ST-18)", () => {
  it("ST-18: no file of test/ but the helpers imports node:fs or node:child_process", () => {
    const paths = owned.list("test", { recursive: true }).map((p) => `test/${p}`);
    expect(paths.flatMap((p) => auditReads(p, /\.(ts|mts|js|mjs)$/.test(p) ? owned.text(p) : ""))).toEqual([]);
  });
});
