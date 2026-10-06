// lint-ids holds RM-01 and RM-02 for docs/design in CI; these cases show it
// refuses a breach of each rule and passes a clean design.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../discussion/tools/lint-ids.mjs");
const dirs: string[] = [];

function lint(files: Record<string, string>): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "lint-ids-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const run = spawnSync(process.execPath, [tool, dir], { encoding: "utf8" });
  return { status: run.status, out: run.stdout };
}

const doc = (rows: string, prose = "KR-Z01. Prose.\n") =>
  `# Doc\n\n${prose}\n| ID | Rule |\n|---|---|\n${rows}`;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("lint-ids", () => {
  it("passes a design where every ID has one block and every mention resolves", () => {
    const r = lint({ "02-kernel.md": doc("| KR-01 | One. |\n| KR-02 | Two, see KR-01. |\n") });
    expect(r.status).toBe(0);
  });

  it("RM-01: refuses an ID defined twice", () => {
    const r = lint({ "02-kernel.md": doc("| KR-01 | One. |\n| KR-01 | Again. |\n") });
    expect(r.status).toBe(1);
    expect(r.out).toContain("KR-01 определён дважды");
  });

  it("RM-02: refuses a rule ID whose prefix is not the document's", () => {
    const r = lint({ "02-kernel.md": doc("| KR-01 | One. |\n| TY-01 | Foreign. |\n") });
    expect(r.status).toBe(1);
    expect(r.out).toContain("TY-01 определён не в своём документе");
  });

  it("RM-02: refuses a mention of an ID that is not defined", () => {
    const r = lint({ "02-kernel.md": doc("| KR-01 | See KR-07. |\n") });
    expect(r.status).toBe(1);
    expect(r.out).toContain("KR-07 упомянут, но не определён");
  });

  it("RM-02: refuses a range with a hole", () => {
    const r = lint({ "02-kernel.md": doc("| KR-01 | One. |\n| KR-03 | See KR-01…KR-03. |\n") });
    expect(r.status).toBe(1);
    expect(r.out).toContain("KR-02 упомянут, но не определён");
  });
});
