// The builders of the md model (LG-42, RM-01, RM-02, RM-Z03): a table of
// clauses is one item of its section, the ID of a block is read from its
// text, and a document that `print` would not write back is refused when it
// is built — what the types do not say is checked there, so `print` refuses
// nothing.
import { describe, expect, it } from "vitest";
import { clause, clauses, document, example, idOf, print, prose, type Clause, type Field, type Item } from "../../src/codec/index.js";
import { ROOT, type Place, type Result } from "../../src/kernel/index.js";

const value = <T>(out: Result<T>): T => {
  if (!out.ok) throw new Error(out.rejections.map((r) => `${r.rule} ${r.path} ${JSON.stringify(r.got)}`).join("; "));
  return out.value;
};
const refusals = (out: Result<unknown>): string[][] => (out.ok ? [] : out.rejections.map((r) => [r.rule, r.path]));
const text = (items: readonly Item[]): string => new TextDecoder().decode(print(value(document({ heading: "Doc", items }))));

const row = (cells: readonly string[], field?: Field): Clause => value(clause({ cells, field }));
const LIST: Field = { list: ["one"] };

describe("a table of clauses is one item of its section (RM-Z03)", () => {
  it("RM-Z03: the table holds its header and its rows; a clause alone is no item of a section", () => {
    const table = value(clauses({ header: ["ID", "Rule"], rows: [row(["AA-01", "x"]), row(["AA-02", "y"])] }));
    expect(table).toEqual({ type: "clauses", header: ["ID", "Rule"], rows: [{ type: "clause", cells: ["AA-01", "x"] }, { type: "clause", cells: ["AA-02", "y"] }] });
    // @ts-expect-error — a clause is a row of its table, never an item of a section by itself
    const items: Item[] = [row(["AA-03", "z"])];
    expect(items).toHaveLength(1);
    expect(text([table])).toBe("# Doc\n\n| ID | Rule |\n|---|---|\n| AA-01 | x |\n| AA-02 | y |\n");
  });

  it("RM-Z03: a field of the last row is written right after its table", () => {
    const table = value(clauses({ header: ["ID", "Rule"], rows: [row(["AA-01", "x"]), row(["AA-02", "Kinds:"], LIST)] }));
    expect(text([table])).toBe("# Doc\n\n| ID | Rule |\n|---|---|\n| AA-01 | x |\n| AA-02 | Kinds: |\n\n- one\n");
  });

  it("RM-01: refuses a table of clauses without rows — a table without IDs is a field, not clauses", () => {
    expect(refusals(clauses({ header: ["ID", "Rule"], rows: [] }))).toEqual([["RM-01", ""]]);
  });
});

describe("the ID of a block is kept once, in its text (RM-01, RM-Z03)", () => {
  it("RM-01: the ID of a paragraph is the start of its text, of a row its first cell — no second copy", () => {
    const p = value(prose({ text: "AA-Z01. Intro." }));
    const c = row(["AA-01", "x"]);
    expect([idOf(p), idOf(c)]).toEqual(["AA-Z01", "AA-01"]);
    expect([Object.keys(p), Object.keys(c)]).toEqual([
      ["type", "text"],
      ["type", "cells"],
    ]);
  });

  it("RM-01: an example keeps its ID — it stands after the language, outside the text", () => {
    const e = value(example({ lang: "json", id: "AA-Z02", text: "{}\n" }));
    expect([idOf(e), e]).toEqual(["AA-Z02", { type: "example", id: "AA-Z02", lang: "json", text: "{}\n" }]);
  });

  it("RM-01: refuses a paragraph without an ID and a row whose first cell is not an ID", () => {
    expect(refusals(prose({ text: "Plain text." }))).toEqual([["RM-01", ""]]);
    expect(refusals(clause({ cells: ["note", "x"] }))).toEqual([["RM-01", ""]]);
  });

  it("RM-01: refuses a second block with the same ID anywhere in the document, at the second", () => {
    const sub = { type: "section", heading: "A", level: 2, items: [value(clauses({ header: ["ID", "Rule"], rows: [row(["AA-02", "x"]), row(["AA-01", "y"])] }))] } as const;
    const out = document({ heading: "Doc", items: [value(prose({ text: "AA-01. x" })), sub] });
    expect(refusals(out)).toEqual([["RM-01", "/items/1/items/0/rows/1"]]);
    const twice = document({ heading: "Doc", items: [value(example({ lang: "text", id: "AA-Z01", text: "" })), value(prose({ text: "AA-Z01. x" }))] });
    expect(refusals(twice)).toEqual([["RM-01", "/items/1"]]);
  });

  it("RM-01: refuses a row with an ID in a field table — that row is a clause, not a cell of a field", () => {
    expect(refusals(prose({ text: "AA-Z01. Forms:", field: { table: { header: ["A", "B"], rows: [["AA-01", "b"]] } } }))).toEqual([["RM-01", ""]]);
  });
});

describe("an ID follows its grammar and its kind (RM-02)", () => {
  it("RM-02: refuses an ID off the grammar, a row with the ID of prose and an example with the ID of a rule", () => {
    expect(refusals(prose({ text: "AA-1. x" }))).toEqual([["RM-02", ""]]);
    expect(refusals(clause({ cells: ["AA-Z01", "x"] }))).toEqual([["RM-02", ""]]);
    expect(refusals(example({ lang: "json", id: "AA-01", text: "" }))).toEqual([["RM-02", ""]]);
  });
});

describe("a block that print does not write back is not built (LG-42)", () => {
  it("LG-42: refuses a field after a block whose text does not end with ':'", () => {
    expect(refusals(prose({ text: "AA-Z01. Kinds", field: LIST }))).toEqual([["LG-42", ""]]);
    expect(refusals(clause({ cells: ["AA-01", "Kinds"], field: LIST }))).toEqual([["LG-42", ""]]);
    expect(refusals(example({ lang: "text", id: "AA-Z01", text: "k\n", field: LIST }))).toEqual([["LG-42", ""]]);
    expect(refusals(prose({ text: "AA-Z01. Kinds:", field: LIST }))).toEqual([]);
  });

  it("LG-42: refuses a row whose number of cells is not the header's — in a table of clauses and in a field table", () => {
    expect(refusals(clauses({ header: ["ID", "Rule"], rows: [row(["AA-01", "x"]), row(["AA-02", "y", "z"])] }))).toEqual([["LG-42", "/rows/1"]]);
    expect(refusals(prose({ text: "AA-Z01. Forms:", field: { table: { header: ["A", "B"], rows: [["a"]] } } }))).toEqual([["LG-42", ""]]);
  });

  it("LG-42: refuses a field on a row other than the last of its table — the table would end there", () => {
    expect(refusals(clauses({ header: ["ID", "Rule"], rows: [row(["AA-01", "Kinds:"], LIST), row(["AA-02", "y"])] }))).toEqual([["LG-42", "/rows/0"]]);
  });

  it("LG-42: refuses a line break in text — a paragraph, a cell, a list item, a heading", () => {
    expect(refusals(prose({ text: "AA-Z01. a\nb" }))).toEqual([["LG-42", ""]]);
    expect(refusals(clause({ cells: ["AA-01", "a\nb"] }))).toEqual([["LG-42", ""]]);
    expect(refusals(prose({ text: "AA-Z01. Kinds:", field: { list: ["a\nb"] } }))).toEqual([["LG-42", ""]]);
    expect(refusals(document({ heading: "a\nb", items: [] }))).toEqual([["LG-42", "/heading"]]);
  });

  it("LG-42: refuses text md does not keep — a space at the end, an unescaped |, a padded cell, an empty list item, a list without items", () => {
    expect(refusals(prose({ text: "AA-Z01. x " }))).toEqual([["LG-42", ""]]);
    for (const cell of ["a | b", " a", "a ", "a\r"]) expect([cell, refusals(clause({ cells: ["AA-01", cell] }))]).toEqual([cell, [["LG-42", ""]]]);
    for (const item of ["", " a"]) expect([item, refusals(prose({ text: "AA-Z01. Kinds:", field: { list: [item] } }))]).toEqual([item, [["LG-42", ""]]]);
    expect(refusals(prose({ text: "AA-Z01. Kinds:", field: { list: [] } }))).toEqual([["LG-42", ""]]);
    expect(refusals(clauses({ header: ["ID", "a | b"], rows: [row(["AA-01", "x"])] }))).toEqual([["LG-42", "/header"]]);
  });

  it("LG-42: refuses an example whose text has a closing line, does not end with a newline, or a bad language", () => {
    expect(refusals(example({ lang: "text", id: "AA-Z01", text: "a\n```\nb\n" }))).toEqual([["LG-42", ""]]);
    expect(refusals(example({ lang: "text", id: "AA-Z01", text: "a" }))).toEqual([["LG-42", ""]]);
    expect(refusals(example({ lang: "Text", id: "AA-Z01", text: "" }))).toEqual([["LG-42", ""]]);
    expect(refusals(example({ lang: "text", id: "AA-Z01", text: "a\n```json\n" }))).toEqual([]);
  });
});

describe("a document whose sections print does not write back is not built (LG-42)", () => {
  it("LG-42: refuses a block after a subsection, and a subsection not deeper than its section", () => {
    const sub = (level: number): Item => ({ type: "section", heading: "A", level, items: [] });
    expect(refusals(document({ heading: "Doc", items: [sub(2), value(prose({ text: "AA-Z01. x" }))] }))).toEqual([["LG-42", "/items/1"]]);
    expect(refusals(document({ heading: "Doc", items: [sub(1)] }))).toEqual([["LG-42", "/items/0/level"]]);
    expect(refusals(document({ heading: "Doc", items: [{ type: "section", heading: "A", level: 3, items: [sub(3)] }] }))).toEqual([["LG-42", "/items/0/items/0/level"]]);
    expect(refusals(document({ heading: "Doc", items: [sub(7)] }))).toEqual([["LG-42", "/items/0/level"]]);
  });

  it("LG-42: refuses a subsection deeper than the subsection before it — parse would read it into that one", () => {
    const sub = (level: number): Item => ({ type: "section", heading: "A", level, items: [] });
    expect(refusals(document({ heading: "Doc", items: [sub(2), sub(3)] }))).toEqual([["LG-42", "/items/1/level"]]);
    expect(text([sub(3), sub(2)])).toBe("# Doc\n\n### A\n\n## A\n");
  });

  it("LG-42: refuses from the place given, with its intent", () => {
    const at: Place = { intent: "x", path: "/docs/a.md" };
    const out = prose({ text: "AA-Z01. a\nb" }, at);
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.path, r.intent])).toEqual([["LG-42", "/docs/a.md", "x"]]);
    const doc = document({ heading: "Doc", items: [{ type: "section", heading: "A", level: 1, items: [] }] }, at);
    expect(doc.ok ? [] : doc.rejections.map((r) => [r.rule, r.path, r.intent])).toEqual([["LG-42", "/docs/a.md/items/0/level", "x"]]);
    expect(refusals(prose({ text: "AA-Z01. a\nb" }, ROOT))).toEqual([["LG-42", ""]]);
  });
});
