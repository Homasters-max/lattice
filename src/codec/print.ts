// The canonical print of the md model (LG-42, G-25): blocks separated by one
// blank line, a table of clauses as its header, its separator and its rows,
// headings by level, a field right after its block, a final newline. Every
// element is written by `form.ts`; a document is built only by the builders,
// which refuse what would not read back, so print refuses nothing: what it
// writes, `parse` reads back as the same document.
import { FENCE, fenceOpen, headingLine, itemLine, rowLine, separator } from "./form.js";
import type { Block, Document, Item, Section } from "./model.js";

const tableLines = (header: readonly string[], rows: readonly (readonly string[])[]): string[] => [rowLine(header), separator(header.length), ...rows.map(rowLine)];

/** The field of a block as its own group of lines, or none (RM-Z03). */
function field(block: Block | undefined): string[][] {
  if (block?.table !== undefined) return [tableLines(block.table.header, block.table.rows)];
  if (block?.list !== undefined) return [block.list.map(itemLine)];
  return [];
}

/** The groups of lines of an item; a table of clauses is one group, the field of its last row the next. */
function groups(item: Item): string[][] {
  switch (item.type) {
    case "section":
      return sectionGroups(item);
    case "clauses":
      return [tableLines(item.header, item.rows.map((r) => r.cells)), ...field(item.rows.at(-1))];
    case "prose":
      return [[item.text], ...field(item)];
    case "example":
      return [[`${fenceOpen(item.lang, item.id)}\n${item.text}${FENCE}`], ...field(item)];
  }
}

function sectionGroups(section: Section): string[][] {
  return [[headingLine(section.level, section.heading)], ...section.items.flatMap(groups)];
}

/** The canonical bytes of a document (LG-42): groups of lines joined by one blank line, and a final newline. */
export function print(document: Document): Uint8Array {
  const text = sectionGroups(document)
    .map((lines) => lines.join("\n"))
    .join("\n\n");
  return new TextEncoder().encode(`${text}\n`);
}
