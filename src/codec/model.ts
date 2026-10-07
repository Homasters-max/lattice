// The model of canonical `md` (RM-Z03, LG-42, G-24): a document is the
// section of level 1; a section holds, in order, its blocks, the header of
// each table it holds and its subsections. The model is what `parse` reads and
// `print` writes; blocks as records are S0-26.

/** A table without IDs, the field `table` of the block above it: its header and rows of cells, verbatim. */
export type Table = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

/** The field a block carries when its text ends with ":" (RM-Z03): a table or a list, never both (G-24), or none. */
export type Field = { readonly table: Table; readonly list?: never } | { readonly table?: never; readonly list: readonly string[] };

type MaybeField = Field | { readonly table?: never; readonly list?: never };

/** A paragraph starting with its ID and a dot; `text` is the paragraph, ID included (RM-Z03). */
export type Prose = { readonly type: "prose"; readonly id: string; readonly text: string } & MaybeField;

/** A table row with its ID in the first cell; `cells` are its cells in column order, the ID cell first. */
export type Clause = { readonly type: "clause"; readonly id: string; readonly cells: readonly string[] } & MaybeField;

/** A fenced block with an ID after its language; `text` is the bytes between the fences, verbatim (G-24). */
export type Example = { readonly type: "example"; readonly id: string; readonly lang: string; readonly text: string } & MaybeField;

/** The header of a table of clauses: the clauses that follow it, up to the next item of another kind, are its rows. */
export type Header = { readonly type: "header"; readonly cells: readonly string[] };

export type Block = Prose | Clause | Example;

/** A heading and what it holds, up to the next heading of the same or a higher level (RM-Z03, LG-42). */
export type Section = {
  readonly type: "section";
  readonly heading: string;
  readonly level: number;
  readonly items: readonly Item[];
};

export type Item = Block | Header | Section;
