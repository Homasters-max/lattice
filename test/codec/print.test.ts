// The canonical print of the md model (LG-42, G-25): one blank line between
// blocks, tables with a |---| separator per column, headings by level, a
// field right after its block, one final newline.
import { describe, expect, it } from "vitest";
import { parse, print, type Section } from "../../src/codec/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const text = (doc: Section): string => new TextDecoder().decode(print(deepFreeze(doc)));

const DOC: Section = {
  type: "section",
  heading: "Doc",
  level: 1,
  items: [
    { type: "prose", id: "AA-Z01", text: "AA-Z01. Kinds:", list: ["one", "two"] },
    {
      type: "section",
      heading: "Rules",
      level: 2,
      items: [
        { type: "header", cells: ["ID", "Rule", "Note"] },
        { type: "clause", id: "AA-01", cells: ["AA-01", "a \\| b", ""] },
        { type: "clause", id: "AA-02", cells: ["AA-02", "x", "Forms:"], table: { header: ["Name", "Form"], rows: [["n", "`f`"]] } },
        { type: "section", heading: "Deep", level: 3, items: [{ type: "example", id: "AA-Z02", lang: "json", text: "{}\n" }] },
      ],
    },
  ],
};

describe("the canonical print (LG-42)", () => {
  it("LG-42: writes one blank line between blocks, |---| per column, headings by level and a final newline", () => {
    expect(text(DOC)).toBe(
      [
        "# Doc",
        "",
        "AA-Z01. Kinds:",
        "",
        "- one",
        "- two",
        "",
        "## Rules",
        "",
        "| ID | Rule | Note |",
        "|---|---|---|",
        "| AA-01 | a \\| b |  |",
        "| AA-02 | x | Forms: |",
        "",
        "| Name | Form |",
        "|---|---|",
        "| n | `f` |",
        "",
        "### Deep",
        "",
        "```json AA-Z02",
        "{}",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("LG-42: what print writes parses back to the same model", () => {
    expect(parse(print(deepFreeze(DOC)))).toEqual({ ok: true, value: DOC });
  });

  it("LG-42: writes a document with no items as its heading alone", () => {
    expect(text({ type: "section", heading: "Doc", level: 1, items: [] })).toBe("# Doc\n");
  });

  it("LG-42: writes an empty example as its two fences", () => {
    expect(text({ type: "section", heading: "D", level: 1, items: [{ type: "example", id: "AA-Z01", lang: "text", text: "" }] })).toBe("# D\n\n```text AA-Z01\n```\n");
  });
});
