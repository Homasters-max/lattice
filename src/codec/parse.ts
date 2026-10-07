// The parse of canonical md into its model (RM-Z03, LG-42, G-25). Input that
// is not canonical is refused, never repaired (LG-42); text that belongs to no
// block, and a second block with the same ID, are refused by RM-01, an ID off
// its grammar or of the other kind by RM-02 — the grammar the kernel writes
// once, beside `RuleId`. Each block is made by its builder (`build.ts`) at the
// place of its line, and the document by `document`, so what parse reads,
// `print` writes back. Every refusal is under the place given — where the
// document sits in its input — and the number of its line; all of them are
// found, not only the first.
import { decodeUtf8, isIdLike, refused, reject, ROOT, type Place, type Rejection, type Result, type Rule } from "../kernel/index.js";
import { clause, clauses, document, example, prose } from "./build.js";
import { ITEM_FORM, readFenceOpen, readHeading, readItem, startsList, startsTable } from "./form.js";
import { cut, lineOf, notCanonical, type Chunk, type FenceChunk, type TextChunk } from "./lines.js";
import { idOf, takesField, type Block, type Clause, type Clauses, type Document, type Example, type Field, type Item, type Prose } from "./model.js";
import { RM_01 } from "./rules.js";
import { readTable, type TableRow } from "./table.js";

/** A section being read: its items grow as chunks are read; the stack holds it and the sections around it. */
type Open = { readonly level: number; readonly items: Item[] };

/**
 * `ids` — the line of the block of each ID read so far (RM-01); `before` — the block the chunk before made, which a
 * field right after it joins (RM-Z03).
 */
type Reader = { readonly place: Place; readonly stack: Open[]; readonly found: Rejection[]; readonly ids: Map<string, number>; before: Block | null };

/** What a refusal expected and what it got. */
type Why = { readonly expected: string; readonly got: string };

function refuseAt(reader: Reader, rule: Rule, line: number, why: Why): void {
  reader.found.push(reject(rule, { ...lineOf(reader.place, line), ...why }));
}

function lg42(reader: Reader, line: number, expected: string, got: string): void {
  reader.found.push(notCanonical(reader.place, line, expected, got));
}

/** The items of the innermost open section: the next item belongs to it. */
const current = (reader: Reader): Item[] => reader.stack.at(-1)?.items ?? [];

/** What a builder made, or `null` — its refusals join the others. */
function made<T>(reader: Reader, out: Result<T>): T | null {
  if (out.ok) return out.value;
  reader.found.push(...out.rejections);
  return null;
}

/** RM-01: one ID — one block; a block whose ID an earlier block has is refused at its line. */
function unique(reader: Reader, block: Block, line: number): boolean {
  const id = idOf(block);
  const first = reader.ids.get(id);
  if (first === undefined) reader.ids.set(id, line);
  else refuseAt(reader, RM_01, line, { expected: `one block per ID; ${id} is the block at line ${first}`, got: id });
  return first === undefined;
}

/** A paragraph or an example made at its line joins its section once its ID is its own; a field may follow it. */
function placed(reader: Reader, block: Prose | Example | null, line: number): Block | null {
  if (block === null || !unique(reader, block, line)) return null;
  current(reader).push(block);
  return block;
}

/** A chunk of one line; the line after it, with no blank line between, is refused (LG-42, G-25). */
function oneLine(reader: Reader, chunk: TextChunk): string {
  const [line = "", next] = chunk.lines;
  if (next !== undefined) lg42(reader, chunk.line + 1, "one blank line between blocks", next);
  return line;
}

/** A heading closes every open section of its level or deeper and opens its own inside the one that remains. */
function readSection(reader: Reader, chunk: TextChunk, level: number, heading: string): null {
  const line = oneLine(reader, chunk);
  if (level === 1) {
    lg42(reader, chunk.line, "one heading of level 1, on the first line", line);
    return null;
  }
  while ((reader.stack.at(-1)?.level ?? 0) >= level) reader.stack.pop();
  const items: Item[] = [];
  current(reader).push({ type: "section", heading, level, items });
  reader.stack.push({ level, items });
  return null;
}

function readProse(reader: Reader, chunk: TextChunk): Block | null {
  const text = oneLine(reader, chunk);
  return placed(reader, made(reader, prose({ text }, lineOf(reader.place, chunk.line))), chunk.line);
}

/** The table of clauses with a field joined to its last row. */
function joinedRow(table: Clauses, row: Clause, field: Field, at: Place): Result<Clauses> {
  const joined = clause({ cells: row.cells, field }, at);
  return joined.ok ? clauses({ header: table.header, rows: [...table.rows.slice(0, -1), joined.value] }, at) : joined;
}

/** The item before a field, built again with the field joined to its block. */
function joined(block: Block, field: Field, last: Item | undefined, at: Place): Result<Item> {
  if (block.type === "prose") return prose({ text: block.text, field }, at);
  if (block.type === "example") return example({ lang: block.lang, id: block.id, text: block.text, field }, at);
  if (last?.type !== "clauses") throw new Error("bug: a row before a field is the last row of the table before it");
  return joinedRow(last, block, field, at);
}

/** RM-Z03: a table or a list without IDs is a field of the block right before it, when that block ends with ":". */
function attach(reader: Reader, field: Field, chunk: TextChunk): void {
  const block = reader.before;
  if (block === null || !takesField(block)) {
    return refuseAt(reader, RM_01, chunk.line, { expected: "a table or list right after a block that ends with ':'", got: chunk.lines[0] ?? "" });
  }
  const items = current(reader);
  const item = made(reader, joined(block, field, items.at(-1), lineOf(reader.place, chunk.line)));
  if (item !== null) items[items.length - 1] = item;
}

function readList(reader: Reader, chunk: TextChunk): null {
  const list = chunk.lines.map(readItem);
  const bad = list.indexOf(null);
  if (bad >= 0) lg42(reader, chunk.line + bad, ITEM_FORM, chunk.lines[bad] ?? "");
  else attach(reader, { list: list.filter((item) => item !== null) }, chunk);
  return null;
}

/** RM-01: a table whose rows have IDs is a table of clauses, each row made at its line; a field may follow its last row. */
function readClauses(reader: Reader, header: readonly string[], rows: readonly TableRow[], line: number): Clause | null {
  const read = rows.map((r) => {
    const row = made(reader, clause({ cells: r.cells }, lineOf(reader.place, r.line)));
    return row !== null && unique(reader, row, r.line) ? row : null;
  });
  const kept = read.filter((r) => r !== null);
  const table = kept.length === 0 ? null : made(reader, clauses({ header, rows: kept }, lineOf(reader.place, line)));
  if (table === null) return null;
  current(reader).push(table);
  return read.at(-1) ?? null;
}

/** A table whose rows have IDs is a table of clauses (RM-01); one without IDs is a field. */
function readTableChunk(reader: Reader, chunk: TextChunk): Block | null {
  const end = chunk.lines.findIndex((l) => !startsTable(l));
  if (end >= 0) lg42(reader, chunk.line + end, "one blank line between blocks", chunk.lines[end] ?? "");
  const read = readTable(end >= 0 ? chunk.lines.slice(0, end) : chunk.lines, chunk.line, reader.place);
  if ("found" in read) {
    reader.found.push(...read.found);
    return null;
  }
  const { header, rows } = read.table;
  if (rows.some((r) => isIdLike(r.cells[0] ?? ""))) return readClauses(reader, header, rows, chunk.line);
  attach(reader, { table: { header, rows: rows.map((r) => r.cells) } }, chunk);
  return null;
}

/** RM-Z03, G-25: a fenced block opened by its language and an ID is an example; its text is the lines inside, verbatim. */
function readFence(reader: Reader, chunk: FenceChunk): Block | null {
  const { lang, id } = readFenceOpen(chunk.open);
  if (id === undefined) {
    refuseAt(reader, RM_01, chunk.line, { expected: "a fenced block with an ID after its language", got: chunk.open });
    return null;
  }
  const text = chunk.body.map((l) => `${l}\n`).join("");
  return placed(reader, made(reader, example({ lang, id, text }, lineOf(reader.place, chunk.line))), chunk.line);
}

/** A chunk read: the block it made, which a field in the next chunk joins, or `null`. */
function readChunk(reader: Reader, chunk: Chunk): Block | null {
  if (chunk.kind === "fence") return readFence(reader, chunk);
  const first = chunk.lines[0] ?? "";
  const heading = readHeading(first);
  if (heading !== null) return readSection(reader, chunk, heading.level, heading.text);
  if (startsTable(first)) return readTableChunk(reader, chunk);
  return startsList(first) ? readList(reader, chunk) : readProse(reader, chunk);
}

const firstLine = (chunk: Chunk): string => (chunk.kind === "text" ? (chunk.lines[0] ?? "") : chunk.open);

function noTitle(reader: Reader, line: number, got: string): null {
  lg42(reader, line, "a heading of level 1 on the first line", got);
  return null;
}

/** The heading of the document: a heading of level 1 alone on the first line (LG-42, RM-Z03), or `null`. */
function title(reader: Reader, first: Chunk | undefined): string | null {
  if (first === undefined) return noTitle(reader, 1, "");
  const heading = first.kind === "text" ? readHeading(firstLine(first)) : null;
  if (first.kind !== "text" || heading?.level !== 1) return noTitle(reader, first.line, firstLine(first));
  oneLine(reader, first);
  return heading.text;
}

type Read = { readonly heading: string | null; readonly items: readonly Item[] };

/** The document: its heading and the items of every other chunk, read on after a refusal to find the rest. */
function readDocument(reader: Reader, chunks: readonly Chunk[]): Read {
  const [first, ...rest] = chunks;
  const heading = title(reader, first);
  const items: Item[] = [];
  reader.stack.push({ level: 1, items });
  for (const chunk of rest) reader.before = readChunk(reader, chunk);
  return { heading, items };
}

/** One refusal per line and rule: a line refused twice for the same rule says nothing more. */
function distinct(found: readonly Rejection[]): Rejection[] {
  const seen = new Set<string>();
  return found.filter((r) => {
    const key = `${r.rule} ${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The model of a document in canonical md (RM-Z03, LG-42), or its refusals: bytes that are not UTF-8 by KR-10 at
 * `place`; every other under `place` and the number of its line, with the intent of `place` (CONVENTIONS.md §3).
 */
export function parse(bytes: Uint8Array, place: Place = ROOT): Result<Document> {
  const text = decodeUtf8(bytes, place);
  if (!text.ok) return text;
  const { chunks, found, whole } = cut(text.value, place);
  const reader: Reader = { place, stack: [], found: [...found], ids: new Map(), before: null };
  const read: Read = whole ? { heading: null, items: [] } : readDocument(reader, chunks);
  const refusal = refused<Document>(distinct(reader.found));
  if (refusal !== null) return refusal;
  if (read.heading === null) throw new Error("bug: a document without its heading is refused");
  return document({ heading: read.heading, items: read.items }, place);
}
