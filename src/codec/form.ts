// The elements of canonical md (LG-42, RM-07, G-25), each written and read
// here and nowhere else: a line, a heading, a list item, a table row and its
// separator, the lines that open and close a fenced block. A writer stands
// beside its reader, so a choice of form is one edit; what a writer writes,
// its reader reads back, and a reader refuses — `null` — what no writer
// writes. Lines are cut into chunks by `lines.ts`, a table is read by
// `table.ts`, a document by `parse.ts` — all of them through this file.

const TRAILING = /[ \t]+$/;

/** LG-42: a line outside an example ends without a space or a tab. */
export const endsWithSpace = (line: string): boolean => TRAILING.test(line);

export const withoutEndSpace = (line: string): string => line.replace(TRAILING, "");

/** LG-42: text that is one line of md — no line break, no carriage return, no space or tab at its end. */
export const isOneLine = (text: string): boolean => !/[\r\n]/.test(text) && !endsWithSpace(text);

/** G-25: headings go from level 1, the document's, to level 6. */
export const DEEPEST_LEVEL = 6;

const HEADING = new RegExp(`^(#{1,${DEEPEST_LEVEL}}) (.+)$`);

/** A heading of level 1…6: its level in `#` and its text after one space. */
export const headingLine = (level: number, text: string): string => `${"#".repeat(level)} ${text}`;

export function readHeading(line: string): { readonly level: number; readonly text: string } | null {
  const [, hashes, text] = HEADING.exec(line) ?? [];
  return hashes === undefined || text === undefined ? null : { level: hashes.length, text };
}

export const HEADING_FORM = "#…###### <text>, one space after the #";

const ITEM = /^- \S/;
const ITEM_START = "- ";

/** A list item (G-25): `- <text>`, one level, one item per line. */
export const itemLine = (text: string): string => `${ITEM_START}${text}`;

/** A chunk whose first line starts so is a list. */
export const startsList = (line: string): boolean => line.startsWith(ITEM_START);

export const readItem = (line: string): string | null => (ITEM.test(line) ? line.slice(ITEM_START.length) : null);

export const ITEM_FORM = "- <text>, one item per line";

const PIPE = /(?<!\\)\|/;

/** A table row (G-25): every cell padded by one space; a `|` inside a cell is escaped as `\|` and kept verbatim. */
export const rowLine = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

/** A chunk whose first line starts so is a table. */
export const startsTable = (line: string): boolean => line.startsWith("|");

/** The text of a cell between its padding, or `null` when it is not padded by exactly one space. */
function cellOf(segment: string): string | null {
  if (segment.length < 2 || !segment.startsWith(" ") || !segment.endsWith(" ")) return null;
  const text = segment.slice(1, -1);
  return /^\s|\s$/.test(text) ? null : text;
}

/** The cells of a row line, or `null` when it is not `| a | b |` with one space around each cell. */
export function readRow(line: string): string[] | null {
  const parts = line.split(PIPE);
  if (parts.length < 3 || parts[0] !== "" || parts.at(-1) !== "") return null;
  const cells = parts.slice(1, -1).map(cellOf);
  return cells.every((c) => c !== null) ? cells : null;
}

export const ROW_FORM = "| cell |, each cell padded by one space";

/** The separator after the header of a table: `|---|` per column (LG-42). */
export const separator = (columns: number): string => `|${"---|".repeat(columns)}`;

/** The line that closes a fenced block, and starts every line that opens one. */
export const FENCE = "```";

const OPEN = /^```([^ ]*)(?: (.*))?$/;
const LANG = /^[a-z][a-z0-9-]*$/;

/** The line that opens an example (G-25): three backticks, its language, one space, its ID. */
export const fenceOpen = (lang: string, id: string): string => `${FENCE}${lang} ${id}`;

export const startsFence = (line: string): boolean => line.startsWith(FENCE);

/** The language and the ID of an opening line; `id` is `undefined` when nothing follows the language. */
export function readFenceOpen(line: string): { readonly lang: string; readonly id: string | undefined } {
  const [, lang = "", id] = OPEN.exec(line) ?? [];
  return { lang, id };
}

/** G-25: the language of an example — lower case letters, digits and `-`, a letter first. */
export const isLang = (lang: string): boolean => LANG.test(lang);

export const FENCE_OPEN_FORM = "```<lang> <ID>";

export const FENCE_CLOSE_FORM = "a closing line ```";

export const FENCED_TEXT_FORM = "lines, each with its newline, none of them ``` alone";

/** LG-42: the text of an example — its lines, each with its newline, none of them the closing line. */
export const isFencedText = (text: string): boolean => text === "" || (text.endsWith("\n") && !text.includes("\r") && !text.slice(0, -1).split("\n").includes(FENCE));
