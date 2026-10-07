// A table of canonical md (LG-42, G-24): a header row, a separator `|---|`
// per column, rows with as many cells as the header. A cell is padded by one
// space on each side; a `|` inside it is escaped as `\|` and kept verbatim.
import type { Rejection } from "../kernel/index.js";
import { notCanonical } from "./lines.js";

/** A row of a table and the number of its line. */
export type Row = { readonly line: number; readonly cells: readonly string[] };

export type ReadTable = { readonly header: readonly string[]; readonly rows: readonly Row[] };

/** A table read, or the refusals of its form. */
type Read = { readonly table: ReadTable } | { readonly found: readonly Rejection[] };

const PIPE = /(?<!\\)\|/;
const CELLS = "| cell |, each cell padded by one space";

/** The text of a cell between its padding, or `null` when it is not padded by exactly one space. */
function cellOf(segment: string): string | null {
  if (segment.length < 2 || !segment.startsWith(" ") || !segment.endsWith(" ")) return null;
  const text = segment.slice(1, -1);
  return /^\s|\s$/.test(text) ? null : text;
}

/** The cells of a row line, or `null` when it is not `| a | b |` with one space around each cell. */
function cellsOf(line: string): string[] | null {
  const parts = line.split(PIPE);
  if (parts.length < 3 || parts[0] !== "" || parts.at(-1) !== "") return null;
  const cells = parts.slice(1, -1).map(cellOf);
  return cells.every((c) => c !== null) ? cells : null;
}

/** LG-42: the rows after the separator, each with the header's number of cells. */
function readRows(lines: readonly string[], first: number, columns: number, path: string): { rows: Row[]; found: Rejection[] } {
  const rows: Row[] = [];
  const found: Rejection[] = [];
  lines.forEach((text, i) => {
    const line = first + i;
    const cells = cellsOf(text);
    if (cells === null) found.push(notCanonical(path, line, CELLS, text));
    else if (cells.length !== columns) found.push(notCanonical(path, line, `${columns} cells, as the header has`, text));
    else rows.push({ line, cells });
  });
  return { rows, found };
}

/**
 * LG-42: the header and rows of a table whose lines start at line `first`, or the refusals of its form. A table with
 * any refusal of form is not read further: whether its rows are clauses is not asked.
 */
export function readTable(lines: readonly string[], first: number, path: string): Read {
  const [head = "", sep, ...body] = lines;
  const header = cellsOf(head);
  if (header === null) return { found: [notCanonical(path, first, CELLS, head)] };
  const separator = `|${"---|".repeat(header.length)}`;
  if (sep !== separator) return { found: [notCanonical(path, sep === undefined ? first : first + 1, separator, sep ?? "absent")] };
  const { rows, found } = readRows(body, first + 2, header.length, path);
  return found.length > 0 ? { found } : { table: { header, rows } };
}
