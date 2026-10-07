// The reference test of the codec (LG-42, RM-07, SL-Z02): every file of
// docs/design parses into the model and prints back to the same bytes. The
// round-trip through blocks is S0-26 and S0-27; this is its first half.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { idOf, parse, print, type Block, type Document, type Section } from "../../src/codec/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const DESIGN = join(import.meta.dirname, "../../docs/design");
const FILES = readdirSync(DESIGN)
  .filter((f) => f.endsWith(".md"))
  .sort();

function parsed(file: string): Document {
  const out = parse(readFileSync(join(DESIGN, file)), { intent: null, path: `/${file}` });
  if (!out.ok) throw new Error(`${file}: ${out.rejections.map((r) => `${r.rule} ${r.path} ${JSON.stringify(r.got)}`).join("; ")}`);
  return out.value;
}

/** Every block of a section and of its subsections, the rows of its tables of clauses among them, in document order. */
const blocks = (s: Section): Block[] => s.items.flatMap((i): readonly Block[] => (i.type === "section" ? blocks(i) : i.type === "clauses" ? i.rows : [i]));

const find = (file: string, id: string): Block | undefined => blocks(parsed(file)).find((b) => idOf(b) === id);

describe("the reference: docs/design round-trips byte for byte (LG-42, RM-07)", () => {
  it("LG-42: reads the whole corpus — README and every document its table RM-Z02 names, 17 files today", () => {
    const docs = find("README.md", "RM-Z02");
    const named = docs?.type === "prose" ? (docs.table?.rows ?? []).map((r) => /\]\(([^)]+)\)/.exec(r[0] ?? "")?.[1]) : [];
    expect(FILES).toEqual(["README.md", ...named].sort());
  });

  it.each(FILES)("LG-42, RM-07: print(parse(%s)) is the same bytes", (file) => {
    const bytes = new Uint8Array(readFileSync(join(DESIGN, file)));
    const out = print(deepFreeze(parsed(file)));
    expect(new TextDecoder().decode(out)).toBe(new TextDecoder().decode(bytes));
    expect(out).toEqual(bytes);
  });
});

describe("the model of the corpus (RM-Z03)", () => {
  it("RM-Z03: a document is the section of level 1, its sections of level 2 inside it", () => {
    const doc = parsed("02-kernel.md");
    expect([doc.type, doc.level, doc.heading]).toEqual(["section", 1, "02. Kernel"]);
    expect(doc.items.filter((i) => i.type === "section").every((s) => s.type === "section" && s.level === 2)).toBe(true);
  });

  it("RM-Z03: a fenced block with an ID after its language is an example with its text verbatim", () => {
    const example = find("02-kernel.md", "KR-Z02");
    expect(example).toMatchObject({ type: "example", id: "KR-Z02", lang: "json" });
    expect(example?.type === "example" && example.text.startsWith("// entity\n") && example.text.endsWith("}\n")).toBe(true);
  });

  it("RM-Z03: a table without IDs after a block ending with ':' is the field table of that block", () => {
    const prose = find("README.md", "RM-Z03");
    expect(prose?.type === "prose" && prose.text.startsWith("RM-Z03. The codec format")).toBe(true);
    expect(prose?.type === "prose" && prose.table?.header).toEqual(["In `md`", "Block"]);
    const clause = find("05-ledger.md", "LG-42");
    expect(clause?.type === "clause" && clause.table?.header).toEqual(["`md`", "Block"]);
  });

  it("LG-42: keeps cell text verbatim — \\|, inline code, links, …, —, →", () => {
    const clause = find("05-ledger.md", "LG-42");
    expect(clause?.type === "clause" && clause.cells[0]).toBe("LG-42");
    expect(clause?.type === "clause" && clause.cells[1]?.includes("tables with a `\\|---\\|` separator")).toBe(true);
    const docs = find("README.md", "RM-Z02");
    expect(docs?.type === "prose" && docs.table?.rows[0]).toEqual(["[00 Glossary](00-glossary.md)", "GL", "terms"]);
  });
});
