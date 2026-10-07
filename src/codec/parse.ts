// The parse of canonical md into its model (RM-Z03, LG-42, G-24). Input that
// is not canonical is refused, never repaired (LG-42); text that belongs to no
// block, and a second block with the same ID, are refused by RM-01, an ID off
// its grammar or of the other kind by RM-02. Every refusal is
// outside any intent and names its line under `path`, where the document sits
// in its input; all of them are found, not only the first.
import { decodeUtf8, refused, reject, type Rejection, type Result, type Rule } from "../kernel/index.js";
import { isId, isIdLike, isProseId, isRuleId } from "./ids.js";
import { cut, notCanonical, type Chunk, type FenceChunk, type TextChunk } from "./lines.js";
import type { Block, Field, Item, Section } from "./model.js";
import { RM_01, RM_02 } from "./rules.js";
import { readTable } from "./table.js";

const HEADING = /^(#{1,6}) (.+)$/;
const PROSE = /^([A-Za-z]+-[A-Za-z]?\d+)\. /;
const OPEN = /^```([^ ]*)(?: (.*))?$/;
const LANG = /^[a-z][a-z0-9-]*$/;
const ITEM = /^- \S/;
const GRAMMAR = "<PREFIX>-<NN> or <PREFIX>-Z<NN>";
const RULE_ID = "<PREFIX>-<NN>: a row with an ID is a rule (RM-01)";
const PROSE_ID = "<PREFIX>-Z<NN>: a fenced block with an ID is an example";

/** A section being read: its items grow as chunks are read; the stack holds it and the sections around it. */
type Open = { readonly level: number; readonly items: Item[] };

/** `ids` — the line of the block of each ID read so far (RM-01). */
type Reader = { readonly path: string; readonly stack: Open[]; readonly found: Rejection[]; readonly ids: Map<string, number> };

/** What a refusal expected and what it got. */
type Why = { readonly expected: string; readonly got: string };

function refuseAt(reader: Reader, rule: Rule, line: number, why: Why): void {
  reader.found.push(reject(rule, { intent: null, path: `${reader.path}/${line}`, ...why }));
}

function lg42(reader: Reader, line: number, expected: string, got: string): void {
  reader.found.push(notCanonical(reader.path, line, expected, got));
}

/** The items of the innermost open section: the next item belongs to it. */
const current = (reader: Reader): Item[] => reader.stack.at(-1)?.items ?? [];

/** RM-01: one ID — one block; a block whose ID an earlier block has is refused at its line. */
function place(reader: Reader, block: Block, line: number): void {
  const first = reader.ids.get(block.id);
  if (first !== undefined) return refuseAt(reader, RM_01, line, { expected: `one block per ID; ${block.id} is the block at line ${first}`, got: block.id });
  reader.ids.set(block.id, line);
  current(reader).push(block);
}

/** A chunk of one line; the line after it, with no blank line between, is refused (LG-42, G-24). */
function oneLine(reader: Reader, chunk: TextChunk): string {
  const [line = "", next] = chunk.lines;
  if (next !== undefined) lg42(reader, chunk.line + 1, "one blank line between blocks", next);
  return line;
}

/** A heading closes every open section of its level or deeper and opens its own inside the one that remains. */
function readHeading(reader: Reader, chunk: TextChunk, level: number, heading: string): void {
  const line = oneLine(reader, chunk);
  if (level === 1) return lg42(reader, chunk.line, "one heading of level 1, on the first line", line);
  while ((reader.stack.at(-1)?.level ?? 0) >= level) reader.stack.pop();
  const items: Item[] = [];
  current(reader).push({ type: "section", heading, level, items });
  reader.stack.push({ level, items });
}

function readProse(reader: Reader, chunk: TextChunk): void {
  const text = oneLine(reader, chunk);
  const id = PROSE.exec(text)?.[1];
  if (id === undefined) return refuseAt(reader, RM_01, chunk.line, { expected: "a paragraph that starts with its ID and a dot", got: text });
  if (!isId(id)) return refuseAt(reader, RM_02, chunk.line, { expected: GRAMMAR, got: id });
  place(reader, { type: "prose", id, text }, chunk.line);
}

/** The text that ends with ":" when a block takes a field (RM-Z03, G-24); an example's without its last newline. */
function lastText(block: Block): string {
  if (block.type === "clause") return block.cells.at(-1) ?? "";
  return block.type === "example" ? block.text.slice(0, -1) : block.text;
}

/** The block right before a field, if it may take one: a block with no field yet. */
function freeBlock(items: readonly Item[]) {
  const last = items.at(-1);
  if (last === undefined || last.type === "section" || last.type === "header") return null;
  return "table" in last || "list" in last ? null : last;
}

/** RM-Z03: a table or a list without IDs is a field of the block right before it, when that block ends with ":". */
function attach(reader: Reader, field: Field, chunk: TextChunk): void {
  const items = current(reader);
  const block = freeBlock(items);
  if (block === null || !lastText(block).endsWith(":")) {
    return refuseAt(reader, RM_01, chunk.line, { expected: "a table or list right after a block that ends with ':'", got: chunk.lines[0] ?? "" });
  }
  items[items.length - 1] = { ...block, ...field };
}

function readList(reader: Reader, chunk: TextChunk): void {
  const bad = chunk.lines.findIndex((l) => !ITEM.test(l));
  if (bad >= 0) return lg42(reader, chunk.line + bad, "- <text>, one item per line", chunk.lines[bad] ?? "");
  attach(reader, { list: chunk.lines.map((l) => l.slice(2)) }, chunk);
}

function readTableRow(reader: Reader, line: number, cells: readonly string[]): void {
  const [id = ""] = cells;
  if (isRuleId(id)) place(reader, { type: "clause", id, cells }, line);
  else if (isIdLike(id)) refuseAt(reader, RM_02, line, { expected: RULE_ID, got: id });
  else refuseAt(reader, RM_01, line, { expected: "a row whose first cell is its ID", got: id });
}

/** A table whose rows have IDs is a header and clauses (RM-01); one without IDs is a field. */
function readTableChunk(reader: Reader, chunk: TextChunk): void {
  const end = chunk.lines.findIndex((l) => !l.startsWith("|"));
  if (end >= 0) lg42(reader, chunk.line + end, "one blank line between blocks", chunk.lines[end] ?? "");
  const read = readTable(end >= 0 ? chunk.lines.slice(0, end) : chunk.lines, chunk.line, reader.path);
  if ("found" in read) return void reader.found.push(...read.found);
  const { header, rows } = read.table;
  if (!rows.some((r) => isIdLike(r.cells[0] ?? ""))) return attach(reader, { table: { header, rows: rows.map((r) => r.cells) } }, chunk);
  current(reader).push({ type: "header", cells: header });
  for (const r of rows) readTableRow(reader, r.line, r.cells);
}

/** RM-Z03, G-24: a fenced block opened by ```<lang> <ID> is an example; its text is the lines inside, verbatim. */
function readFence(reader: Reader, chunk: FenceChunk): void {
  const [, lang = "", id] = OPEN.exec(chunk.open) ?? [];
  if (id === undefined) return refuseAt(reader, RM_01, chunk.line, { expected: "a fenced block with an ID after its language", got: chunk.open });
  if (!LANG.test(lang) || !isIdLike(id)) return lg42(reader, chunk.line, "```<lang> <ID>", chunk.open);
  if (!isProseId(id)) return refuseAt(reader, RM_02, chunk.line, { expected: PROSE_ID, got: id });
  place(reader, { type: "example", id, lang, text: chunk.body.map((l) => `${l}\n`).join("") }, chunk.line);
}

function readChunk(reader: Reader, chunk: Chunk): void {
  if (chunk.kind === "fence") return readFence(reader, chunk);
  const first = chunk.lines[0] ?? "";
  const heading = HEADING.exec(first);
  if (heading !== null) return readHeading(reader, chunk, (heading[1] ?? "").length, heading[2] ?? "");
  if (first.startsWith("|")) return readTableChunk(reader, chunk);
  return first.startsWith("- ") ? readList(reader, chunk) : readProse(reader, chunk);
}

const firstLine = (chunk: Chunk): string => (chunk.kind === "text" ? (chunk.lines[0] ?? "") : chunk.open);

function noTitle(reader: Reader, line: number, got: string): null {
  lg42(reader, line, "a heading of level 1 on the first line", got);
  return null;
}

/** The heading of the document: a heading of level 1 alone on the first line (LG-42, RM-Z03), or `null`. */
function title(reader: Reader, first: Chunk | undefined): string | null {
  if (first === undefined) return noTitle(reader, 1, "");
  const heading = first.kind === "text" ? HEADING.exec(firstLine(first)) : null;
  if (first.kind !== "text" || heading?.[1] !== "#") return noTitle(reader, first.line, firstLine(first));
  oneLine(reader, first);
  return heading[2] ?? "";
}

/** The document: the section of level 1 that holds every other chunk, read on after a refusal to find the rest. */
function readDocument(reader: Reader, chunks: readonly Chunk[]): Section | null {
  const [first, ...rest] = chunks;
  const heading = title(reader, first);
  const items: Item[] = [];
  reader.stack.push({ level: 1, items });
  for (const chunk of rest) readChunk(reader, chunk);
  return heading === null ? null : { type: "section", heading, level: 1, items };
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
 * `path`; every other at `path` and the number of its line.
 */
export function parse(bytes: Uint8Array, path = ""): Result<Section> {
  const text = decodeUtf8(bytes, path);
  if (!text.ok) return text;
  const { chunks, found, whole } = cut(text.value, path);
  const reader: Reader = { path, stack: [], found: [...found], ids: new Map() };
  const document = whole ? null : readDocument(reader, chunks);
  const refusal = refused<Section>(distinct(reader.found));
  if (refusal !== null) return refusal;
  if (document === null) throw new Error("bug: a document without its heading is refused");
  return { ok: true, value: document };
}
