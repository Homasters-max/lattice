// The model of canonical `md` (RM-Z03, LG-42, G-25): a document is the
// section of level 1; a section holds, in order, its blocks and tables of
// clauses, then its subsections. A table of clauses is one item — its header
// and its rows together; a clause is a row of its table and nothing else. The
// ID of a block is kept once: a paragraph starts with it, a row holds it in
// its first cell, an example names it after its language. The model is what
// `parse` reads and `print` writes; blocks as records are S0-26.
//
// The types say what they can; the rest — one line of text, a ':' before a
// field, the cells of a row, IDs — the builders of `build.ts` check. A value
// of the model is made by them only (the types carry a mark no other code
// sets), so a document `print` would not write back is never built.
import { isIdLike } from "../kernel/index.js";

declare const BUILT: unique symbol;
declare const WHOLE: unique symbol;

/** The mark of a value a builder of `build.ts` made; it exists in types only. */
type Built = { readonly [BUILT]: true };

/** A table without IDs, the field `table` of the block above it: its header and rows of cells, verbatim. */
export type Table = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

/** The field a block carries when its text ends with ":" (RM-Z03): a table or a list, never both (G-25), or none. */
export type Field = { readonly table: Table; readonly list?: never } | { readonly table?: never; readonly list: readonly string[] };

type MaybeField = Field | { readonly table?: never; readonly list?: never };

/** A paragraph starting with its ID and a dot; `text` is the paragraph, ID included (RM-Z03). */
export type Prose = { readonly type: "prose"; readonly text: string } & MaybeField & Built;

/** A row of a table of clauses: its cells in column order, the ID cell first (RM-01). */
export type Clause = { readonly type: "clause"; readonly cells: readonly string[] } & MaybeField & Built;

/** A fenced block with an ID after its language; `text` is the bytes between the fences, verbatim (G-25). */
export type Example = { readonly type: "example"; readonly id: string; readonly lang: string; readonly text: string } & MaybeField & Built;

/** A table of clauses (RM-01, RM-Z03): its header and its rows, one item of its section; a field of its last row follows it. */
export type Clauses = { readonly type: "clauses"; readonly header: readonly string[]; readonly rows: readonly Clause[] } & Built;

export type Block = Prose | Clause | Example;

/** A heading and what it holds, up to the next heading of the same or a higher level (RM-Z03, LG-42). */
export type Section = {
  readonly type: "section";
  readonly heading: string;
  readonly level: number;
  readonly items: readonly Item[];
};

export type Item = Prose | Example | Clauses | Section;

/** A document (RM-Z03): the section of level 1, checked whole by `document` of `build.ts`. */
export type Document = Section & { readonly [WHOLE]: true };

/** The ID a paragraph starts with: what comes before its first ". ", when an author meant it as an ID (RM-01). */
export function proseId(text: string): string | undefined {
  const dot = text.indexOf(". ");
  const id = dot < 0 ? undefined : text.slice(0, dot);
  return id !== undefined && isIdLike(id) ? id : undefined;
}

/** RM-01: the ID of a block, read where the block keeps it — the start of a paragraph, the first cell of a row. */
export function idOf(block: Block): string {
  const id = block.type === "example" ? block.id : block.type === "clause" ? block.cells[0] : proseId(block.text);
  if (id === undefined) throw new Error("bug: a block is built with its ID");
  return id;
}

/** What a block is made of, before it is built. */
type Shape = { readonly type: "prose" | "example"; readonly text: string } | { readonly type: "clause"; readonly cells: readonly string[] };

/** The text that ends with ":" when a block takes a field (RM-Z03, G-25); an example's without its last newline. */
function lastText(block: Shape): string {
  if (block.type === "clause") return block.cells.at(-1) ?? "";
  return block.type === "example" ? block.text.slice(0, -1) : block.text;
}

/** RM-Z03: a block may take a field when its text ends with ":". */
export const takesField = (block: Shape): boolean => lastText(block).endsWith(":");
