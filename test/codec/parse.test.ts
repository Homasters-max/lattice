// The parse of canonical md (LG-42, RM-01, RM-02, G-24): a document becomes
// the model, and input that is not canonical is refused, never repaired, at
// the number of its line under the path given.
import { describe, expect, it } from "vitest";
import { parse } from "../../src/codec/index.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;
const read = (text: string, path = "") => parse(new TextEncoder().encode(text), path);
const refusals = (text: string): (string | null)[][] => {
  const out = read(text);
  return out.ok ? [] : out.rejections.map((r) => [r.rule, r.path, r.intent]);
};
const rules = (text: string): string[][] => refusals(text).map(([rule, path]) => [String(rule), String(path)]);

describe("the model of md (RM-Z03)", () => {
  it("RM-Z03: reads headings, prose, a table of clauses and an example into nested sections", () => {
    const text = md("# Doc", "", "AA-Z01. Intro.", "", "## One", "", "| ID | Rule |", "|---|---|", "| AA-01 | First. |", "| AA-02 | Second. |", "", "### Deep", "", "```json AA-Z02", "{ }", "", "```", "", "## Two", "", "AA-Z03. Last.");
    expect(read(text)).toEqual({
      ok: true,
      value: {
        type: "section",
        heading: "Doc",
        level: 1,
        items: [
          { type: "prose", id: "AA-Z01", text: "AA-Z01. Intro." },
          {
            type: "section",
            heading: "One",
            level: 2,
            items: [
              { type: "header", cells: ["ID", "Rule"] },
              { type: "clause", id: "AA-01", cells: ["AA-01", "First."] },
              { type: "clause", id: "AA-02", cells: ["AA-02", "Second."] },
              { type: "section", heading: "Deep", level: 3, items: [{ type: "example", id: "AA-Z02", lang: "json", text: "{ }\n\n" }] },
            ],
          },
          { type: "section", heading: "Two", level: 2, items: [{ type: "prose", id: "AA-Z03", text: "AA-Z03. Last." }] },
        ],
      },
    });
  });

});

describe("fields and verbatim text of the model (RM-Z03, LG-42)", () => {
  it("RM-Z03: a table or a list without IDs right after a block ending with ':' is a field of that block", () => {
    const text = md("# Doc", "", "AA-Z01. Formats:", "", "| Name | Form |", "|---|---|", "| a | b |", "", "| ID | Rule |", "|---|---|", "| AA-01 | Kinds: |", "", "- one", "- two `x`");
    const out = read(text);
    expect(out.ok && out.value.items).toEqual([
      { type: "prose", id: "AA-Z01", text: "AA-Z01. Formats:", table: { header: ["Name", "Form"], rows: [["a", "b"]] } },
      { type: "header", cells: ["ID", "Rule"] },
      { type: "clause", id: "AA-01", cells: ["AA-01", "Kinds:"], list: ["one", "two `x`"] },
    ]);
  });

  it("LG-42: keeps cell text verbatim — \\|, inline code, links, …, —, →, and an empty cell", () => {
    const row = "| AA-01 | `a \\| b` [x](y.md#z) AA-01…AA-03 — → |  |";
    const out = read(md("# Doc", "", "| ID | Rule | Note |", "|---|---|---|", row));
    expect(out.ok && out.value.items[1]).toEqual({ type: "clause", id: "AA-01", cells: ["AA-01", "`a \\| b` [x](y.md#z) AA-01…AA-03 — →", ""] });
  });

  it("LG-42: an example keeps blank lines, trailing spaces and fences of other forms verbatim", () => {
    const out = read(md("# Doc", "", "```text AA-Z01", "a  ", "", "", "```json", "```"));
    expect(out.ok && out.value.items).toEqual([{ type: "example", id: "AA-Z01", lang: "text", text: "a  \n\n\n```json\n" }]);
    const empty = read(md("# Doc", "", "```text AA-Z01", "```"));
    expect(empty.ok && empty.value.items).toEqual([{ type: "example", id: "AA-Z01", lang: "text", text: "" }]);
  });

  it("LG-42: a heading of a lower level closes the deeper sections", () => {
    const out = read(md("# Doc", "", "## A", "", "#### B", "", "### C", "", "## D"));
    expect(out.ok && JSON.stringify(out.value.items.map((s) => s.type === "section" && [s.heading, s.items.map((t) => t.type === "section" && t.heading)]))).toBe(
      JSON.stringify([["A", ["B", "C"]], ["D", []]]),
    );
  });
});

describe("non-canonical md is refused, never repaired (LG-42)", () => {
  it("LG-42: refuses CRLF, a missing final newline and a carriage return anywhere", () => {
    expect(rules("# Doc\r\n")).toEqual([["LG-42", "/1"]]);
    expect(rules("# Doc\n\nAA-Z01. a\rb\n")).toEqual([["LG-42", "/3"]]);
    expect(rules("# Doc\n\nAA-Z01. x")).toEqual([["LG-42", "/3"]]);
    expect(rules("")).toEqual([["LG-42", "/1"]]);
  });

  it("LG-42: refuses two blank lines in a row, a blank line at the start or at the end", () => {
    expect(rules(md("# Doc", "", "", "AA-Z01. x"))).toEqual([["LG-42", "/3"]]);
    expect(rules(md("", "# Doc"))).toEqual([["LG-42", "/1"]]);
    expect(rules(md("# Doc", ""))).toEqual([["LG-42", "/2"]]);
  });

  it("LG-42: refuses trailing spaces outside an example", () => {
    expect(rules(md("# Doc ", "", "AA-Z01. x\t"))).toEqual([["LG-42", "/1"], ["LG-42", "/3"]]);
    expect(rules(md("# Doc", "", " "))).toEqual([["LG-42", "/3"]]);
  });

  it("LG-42: refuses a separator other than |---| for each column, or none", () => {
    const table = (sep: string) => md("# Doc", "", "| ID | Rule |", sep, "| AA-01 | x |");
    for (const sep of ["|:---|---|", "| --- | --- |", "|----|---|", "|---|", "|---|---|---|"]) expect([sep, rules(table(sep))]).toEqual([sep, [["LG-42", "/4"]]]);
    expect(rules(md("# Doc", "", "| ID | Rule |", "| AA-01 | x |"))).toEqual([["LG-42", "/4"]]);
  });

  it("LG-42: refuses a row whose number of cells is not the header's, and cells not padded by one space", () => {
    expect(rules(md("# Doc", "", "| ID | Rule |", "|---|---|", "| AA-01 | x | y |"))).toEqual([["LG-42", "/5"]]);
    for (const row of ["|AA-01 | x |", "| AA-01 |x |", "| AA-01 |  x |", "| AA-01 | x", "| AA-01 | x \\|"]) {
      expect([row, rules(md("# Doc", "", "| ID | Rule |", "|---|---|", row))]).toEqual([row, [["LG-42", "/5"]]]);
    }
  });

});

describe("non-canonical blocks are refused (LG-42)", () => {
  it("LG-42: refuses a document that does not start with one heading of level 1", () => {
    expect(rules(md("AA-Z01. x"))).toEqual([["LG-42", "/1"]]);
    expect(rules(md("## Doc"))).toEqual([["LG-42", "/1"]]);
    expect(rules(md("\uFEFF# Doc"))).toEqual([["LG-42", "/1"]]);
    expect(rules(md("# Doc", "", "# Again"))).toEqual([["LG-42", "/3"]]);
  });

  it("LG-42: refuses blocks without one blank line between them — a paragraph is one line (G-24)", () => {
    expect(rules(md("# Doc", "AA-Z01. x"))).toEqual([["LG-42", "/2"]]);
    expect(rules(md("# Doc", "", "AA-Z01. x", "continued"))).toEqual([["LG-42", "/4"]]);
    expect(rules(md("# Doc", "", "| ID | Rule |", "|---|---|", "| AA-01 | x |", "AA-Z01. y"))).toEqual([["LG-42", "/6"]]);
    expect(rules(md("# Doc", "", "AA-Z01. x", "```text AA-Z02", "```"))).toEqual([["LG-42", "/4"]]);
    expect(rules(md("# Doc", "", "```text AA-Z02", "```", "AA-Z01. x"))).toEqual([["LG-42", "/5"]]);
    expect(rules(md("# Doc", "", "AA-Z01. x:", "", "- a", "b"))).toEqual([["LG-42", "/6"]]);
  });

  it("LG-42: refuses an example that is never closed or whose opening line is not ```<lang> <ID>", () => {
    expect(rules(md("# Doc", "", "```text AA-Z01", "x"))).toEqual([["LG-42", "/3"]]);
    for (const open of ["``` AA-Z01", "```Text AA-Z01", "```text  AA-Z01", "```text AA-Z01 x"]) {
      expect([open, rules(md("# Doc", "", open, "```"))]).toEqual([open, [["LG-42", "/3"]]]);
    }
  });

  it("LG-42: refuses a list item that is not `- <text>`", () => {
    for (const item of ["-a", "-  a", "- "]) expect([item, rules(md("# Doc", "", "AA-Z01. x:", "", "- a", item))]).toEqual([item, [["LG-42", "/6"]]]);
  });

  it("LG-42: refuses with the line under the path given, outside any intent, all refusals sorted", () => {
    const out = read(md("# Doc ", "", "", "x"), "/docs/design/x.md");
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.path, r.intent])).toEqual([
      ["LG-42", "/docs/design/x.md/1", null],
      ["LG-42", "/docs/design/x.md/3", null],
      ["RM-01", "/docs/design/x.md/4", null],
    ]);
  });

  it("KR-10: refuses bytes that are not UTF-8 by the kernel's decode, at the path given", () => {
    const out = parse(Uint8Array.from([0x23, 0x20, 0xff, 0x0a]), "/x.md");
    expect(out.ok ? [] : out.rejections.map((r) => [r.rule, r.path])).toEqual([["KR-10", "/x.md"]]);
  });
});

describe("every block has an ID (RM-01)", () => {
  it("RM-01: refuses a paragraph without an ID", () => {
    for (const p of ["Plain text.", "AA-Z01 no dot", "**AA-01**. bold", "> AA-01. quote", "1. item", "* item", "#Doc", "####### seven"]) {
      expect([p, rules(md("# Doc", "", p))]).toEqual([p, [["RM-01", "/3"]]]);
    }
  });

  it("RM-01: refuses a table or a list without IDs that is not right after a block ending with ':'", () => {
    expect(rules(md("# Doc", "", "| A | B |", "|---|---|", "| a | b |"))).toEqual([["RM-01", "/3"]]);
    expect(rules(md("# Doc", "", "AA-Z01. x", "", "- a"))).toEqual([["RM-01", "/5"]]);
    expect(rules(md("# Doc", "", "AA-Z01. x:", "", "- a", "", "- b"))).toEqual([["RM-01", "/7"]]);
    expect(rules(md("# Doc", "", "## A:", "", "- a"))).toEqual([["RM-01", "/5"]]);
  });

  it("RM-01: refuses a row without an ID in a table of clauses, and an example without an ID", () => {
    expect(rules(md("# Doc", "", "| ID | Rule |", "|---|---|", "| AA-01 | x |", "| note | y |"))).toEqual([["RM-01", "/6"]]);
    for (const open of ["```", "```json"]) expect([open, rules(md("# Doc", "", open, "{}", "```"))]).toEqual([open, [["RM-01", "/3"]]]);
  });
});

describe("an ID follows its grammar (RM-02)", () => {
  it("RM-02: refuses an ID not of the form <PREFIX>-<NN> or <PREFIX>-Z<NN> in a paragraph, a row or an example", () => {
    for (const id of ["AA-1", "AA-001", "aa-01", "A-01", "AAA-01", "AA-X01", "AA-Z1"]) {
      expect([id, rules(md("# Doc", "", `${id}. x`))]).toEqual([id, [["RM-02", "/3"]]]);
      expect([id, rules(md("# Doc", "", "| ID | Rule |", "|---|---|", `| ${id} | x |`))]).toEqual([id, [["RM-02", "/5"]]]);
      expect([id, rules(md("# Doc", "", `\`\`\`json ${id}`, "```"))]).toEqual([id, [["RM-02", "/3"]]]);
    }
  });
});
