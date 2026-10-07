// A table of canonical md (LG-42, G-25): a header row, a separator `---` per
// column, rows with as many cells as the header. The form of a row and of
// the separator is `form.ts`'s; here the lines of a table chunk are read.
import type { Place, Rejection } from "../kernel/index.js";
import { readRow, ROW_FORM, separator } from "./form.js";
import { notCanonical } from "./lines.js";

/** A row of a table of md and the number of its line; not a row of fold or delta (LG-35). */
export type TableRow = { readonly line: number; readonly cells: readonly string[] };

export type ReadTable = { readonly header: readonly string[]; readonly rows: readonly TableRow[] };

/** A table read, or the refusals of its form. */
type Read = { readonly table: ReadTable } | { readonly found: readonly Rejection[] };

/** LG-42: the rows after the separator, each with the header's number of cells. */
function readRows(lines: readonly string[], first: number, columns: number, place: Place): { rows: TableRow[]; found: Rejection[] } {
  const rows: TableRow[] = [];
  const found: Rejection[] = [];
  lines.forEach((text, i) => {
    const line = first + i;
    const cells = readRow(text);
    if (cells === null) found.push(notCanonical(place, line, ROW_FORM, text));
    else if (cells.length !== columns) found.push(notCanonical(place, line, `${columns} cells, as the header has`, text));
    else rows.push({ line, cells });
  });
  return { rows, found };
}

/**
 * LG-42: the header and rows of a table whose lines start at line `first` of the document at `place`, or the refusals
 * of its form. A table with any refusal of form is not read further: whether its rows are clauses is not asked.
 */
export function readTable(lines: readonly string[], first: number, place: Place): Read {
  const [head = "", sep, ...body] = lines;
  const header = readRow(head);
  if (header === null) return { found: [notCanonical(place, first, ROW_FORM, head)] };
  const expected = separator(header.length);
  if (sep !== expected) return { found: [notCanonical(place, sep === undefined ? first : first + 1, expected, sep ?? "absent")] };
  const { rows, found } = readRows(body, first + 2, header.length, place);
  return found.length > 0 ? { found } : { table: { header, rows } };
}
