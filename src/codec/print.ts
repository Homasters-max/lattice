// The canonical print of the md model (LG-42, G-25): blocks separated by one
// blank line, a table as its header, a `|---|` separator per column and its
// rows, headings by level, a field right after its block, a final newline.
// What `parse` accepts, `print` writes back byte for byte.
import type { Block, Item, Section, Table } from "./model.js";

/** A row of a table: every cell padded by one space (G-25). */
const tableRow = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

const separator = (columns: number): string => `|${"---|".repeat(columns)}`;

const tableLines = (table: Table): string[] => [tableRow(table.header), separator(table.header.length), ...table.rows.map(tableRow)];

/** The field of a block as its own group of lines, or none (RM-Z03). */
function field(block: Block): string[][] {
  if (block.table !== undefined) return [tableLines(block.table)];
  if (block.list !== undefined) return [block.list.map((item) => `- ${item}`)];
  return [];
}

/** The groups of lines of an item; a clause continues the table of the group before it. */
function groups(item: Item, before: string[] | undefined): string[][] {
  switch (item.type) {
    case "section":
      return sectionGroups(item);
    case "header":
      return [[tableRow(item.cells), separator(item.cells.length)]];
    case "clause":
      before?.push(tableRow(item.cells));
      return field(item);
    case "prose":
      return [[item.text], ...field(item)];
    case "example":
      return [[`\`\`\`${item.lang} ${item.id}\n${item.text}\`\`\``], ...field(item)];
  }
}

function sectionGroups(section: Section): string[][] {
  const out: string[][] = [[`${"#".repeat(section.level)} ${section.heading}`]];
  for (const item of section.items) out.push(...groups(item, out.at(-1)));
  return out;
}

/** The canonical bytes of a document (LG-42): groups of lines joined by one blank line, and a final newline. */
export function print(document: Section): Uint8Array {
  const text = sectionGroups(document)
    .map((lines) => lines.join("\n"))
    .join("\n\n");
  return new TextEncoder().encode(`${text}\n`);
}
