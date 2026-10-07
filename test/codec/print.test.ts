// The canonical print of the md model (LG-42, G-25): one blank line between
// blocks, tables with a |---| separator per column, headings by level, a
// field right after its block, one final newline.
import { describe, expect, it } from "vitest";
import { clause, clauses, document, example, parse, print, prose, type Document } from "../../src/codec/index.js";
import type { Result } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

const value = <T>(out: Result<T>): T => {
  if (!out.ok) throw new Error(out.rejections.map((r) => `${r.rule} ${r.path}`).join("; "));
  return out.value;
};

const text = (doc: Document): string => new TextDecoder().decode(print(deepFreeze(doc)));

const DOC: Document = value(
  document({
    heading: "Doc",
    items: [
      value(prose({ text: "AA-Z01. Kinds:", field: { list: ["one", "two"] } })),
      {
        type: "section",
        heading: "Rules",
        level: 2,
        items: [
          value(
            clauses({
              header: ["ID", "Rule", "Note"],
              rows: [
                value(clause({ cells: ["AA-01", "a \\| b", ""] })),
                value(clause({ cells: ["AA-02", "x", "Forms:"], field: { table: { header: ["Name", "Form"], rows: [["n", "`f`"]] } } })),
              ],
            }),
          ),
          { type: "section", heading: "Deep", level: 3, items: [value(example({ lang: "json", id: "AA-Z02", text: "{}\n" }))] },
        ],
      },
    ],
  }),
);

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
    expect(text(value(document({ heading: "Doc", items: [] })))).toBe("# Doc\n");
  });

  it("LG-42: writes an empty example as its two fences", () => {
    expect(text(value(document({ heading: "D", items: [value(example({ lang: "text", id: "AA-Z01", text: "" }))] })))).toBe("# D\n\n```text AA-Z01\n```\n");
  });
});
