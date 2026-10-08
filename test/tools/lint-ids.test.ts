// lint-ids holds RM-01 and RM-02 for docs/design in CI; these cases show it
// refuses a breach of each rule and passes a clean design.
import { afterEach, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const tool = program("discussion/tools/lint-ids.mjs");
const dirs: Scratch[] = [];

function lint(files: { readonly [name: string]: string }): { status: number | null; out: string } {
  const dir = scratch("lint-ids-");
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) dir.write(name, text);
  const run = tool.run([dir.dir]);
  return { status: run.status, out: run.stdout };
}

const doc = (rows: string, prose = "KR-Z01. Prose.\n") =>
  `# Doc\n\n${prose}\n| ID | Rule |\n|---|---|\n${rows}`;

afterEach(() => {
  for (const dir of dirs.splice(0)) dir.remove();
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
