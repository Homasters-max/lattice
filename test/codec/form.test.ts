// One owner of each element of canonical md (RM-07, LG-42, G-25): a heading,
// a list item, a table row and its separator, the opening line of a fenced
// block are written and read in `src/codec/form.ts`, side by side; no other
// file of the codec spells their form.
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { fenceOpen, headingLine, itemLine, readFenceOpen, readHeading, readItem, readRow, rowLine, separator } from "../../src/codec/form.js";
import { repoTree } from "../structure/tree.js";

describe("each element of md is read and written in one place (RM-07)", () => {
  it("RM-07: what a writer of form.ts writes, its reader reads back", () => {
    expect(readHeading(headingLine(3, "Deep # x"))).toEqual({ level: 3, text: "Deep # x" });
    expect(readItem(itemLine("two `x`"))).toBe("two `x`");
    expect(readRow(rowLine(["AA-01", "a \\| b", ""]))).toEqual(["AA-01", "a \\| b", ""]);
    expect(readFenceOpen(fenceOpen("json", "AA-Z01"))).toEqual({ lang: "json", id: "AA-Z01" });
    expect(separator(3)).toBe("|---|---|---|");
  });

  it("RM-07: a reader of form.ts refuses a line its writer never writes", () => {
    expect([readHeading("####### x"), readHeading("#x"), readItem("-a"), readItem("-  a"), readRow("| a |b |"), readRow("| a")]).toEqual([null, null, null, null, null, null]);
    expect(readFenceOpen("```json")).toEqual({ lang: "json", id: undefined });
  });

  it("RM-07: no file of the codec but form.ts spells the form — no literal with ``` | # or a leading '- '", () => {
    const spelled: string[] = [];
    for (const [path, sf] of repoTree().files) {
      if (!path.startsWith("src/codec/") || path === "src/codec/form.ts") continue;
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node)) {
          if (/```|\||#|^- /.test(node.text)) spelled.push(`${path}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(spelled).toEqual([]);
  });
});
