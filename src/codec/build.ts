// The builders of the md model (LG-42, RM-01, RM-02, RM-Z03): the one way to
// a value of the model, for `parse` and for every caller. Each refuses what
// `print` would not write back as `parse` reads it — text that is not one
// line, a field after text that does not end with ':', a row with the wrong
// number of cells, a field before the last row of a table, an ID off its
// grammar or of the other kind, two blocks with one ID — so `print` refuses
// nothing. A block is refused at the place given; a table of clauses and a
// document name the row or the item under it (JSON Pointer).
import { isId, isIdLike, isRuleId, isZBlockId, reject, refused, ROOT, type JsonValue, type Place, type Rejection, type Result, type Rule } from "../kernel/index.js";
import {
  DEEPEST_LEVEL,
  FENCE_OPEN_FORM,
  FENCED_TEXT_FORM,
  fenceOpen,
  HEADING_FORM,
  headingLine,
  isFencedText,
  isLang,
  isOneLine,
  ITEM_FORM,
  itemLine,
  readFenceOpen,
  readHeading,
  readItem,
  readRow,
  ROW_FORM,
  rowLine,
} from "./form.js";
import { idOf, proseId, takesField, type Block, type Clause, type Clauses, type Document, type Example, type Field, type Item, type Prose, type Section, type Table } from "./model.js";
import { LG_42, RM_01, RM_02 } from "./rules.js";

const GRAMMAR = "<PREFIX>-<NN> or <PREFIX>-Z<NN>";
const RULE_ID = "<PREFIX>-<NN>: a row with an ID is a rule (RM-01)";
const Z_BLOCK_ID = "<PREFIX>-Z<NN>: a fenced block with an ID is an example";
const ONE_LINE = "one line, with no space at its end";

const refusal = (rule: Rule, place: Place, expected: string, got: JsonValue): Rejection => reject(rule, { ...place, expected, got });

/** The place of a member of the value at `place`: `pointer` appended to its path, its intent kept. */
const under = (place: Place, pointer: string): Place => ({ intent: place.intent, path: `${place.path}${pointer}` });

/** The value, built, or the refusals that kept it from being built. */
const made = <T>(value: T, found: readonly Rejection[]): Result<T> => refused<T>(found) ?? { ok: true, value };

/** LG-42: cells that a row writes and reads back as they are. */
function writesRow(cells: readonly string[]): boolean {
  const read = readRow(rowLine(cells));
  return cells.length > 0 && cells.every(isOneLine) && read !== null && read.length === cells.length && read.every((c, i) => c === cells[i]);
}

const rowRefusals = (cells: readonly string[], place: Place): Rejection[] => (writesRow(cells) ? [] : [refusal(LG_42, place, ROW_FORM, cells)]);

function listRefusals(list: readonly string[], place: Place): Rejection[] {
  if (list.length === 0) return [refusal(LG_42, place, ITEM_FORM, list)];
  const bad = list.find((item) => !isOneLine(item) || readItem(itemLine(item)) !== item);
  return bad === undefined ? [] : [refusal(LG_42, place, ITEM_FORM, bad)];
}

/** LG-42, RM-01: a field table — rows of the header's cells, none of them with an ID, or it is a table of clauses. */
function tableRefusals(table: Table, place: Place): Rejection[] {
  const columns = table.header.length;
  const bad = [table.header, ...table.rows].find((cells) => !writesRow(cells));
  const count = table.rows.find((cells) => cells.length !== columns);
  const withId = table.rows.find((cells) => isIdLike(cells[0] ?? ""));
  return [
    ...(bad === undefined ? [] : [refusal(LG_42, place, ROW_FORM, bad)]),
    ...(count === undefined ? [] : [refusal(LG_42, place, `${columns} cells, as the header has`, count)]),
    ...(withId === undefined ? [] : [refusal(RM_01, place, "a table without IDs: a row with an ID is a clause", withId)]),
  ];
}

/** RM-Z03, G-25: a field follows a block whose text ends with ":"; its list items and table rows are written as read. */
function fieldRefusals(block: Parameters<typeof takesField>[0], field: Field | undefined, place: Place): Rejection[] {
  if (field === undefined) return [];
  if (!takesField(block)) return [refusal(LG_42, place, "a text that ends with ':' before its field", block.type === "clause" ? block.cells : block.text)];
  return field.list !== undefined ? listRefusals(field.list, place) : tableRefusals(field.table, place);
}

/** RM-01, RM-02: a paragraph starts with an ID and a dot, the ID of either kind. */
function proseIdRefusals(text: string, place: Place): Rejection[] {
  const id = proseId(text);
  if (id === undefined) return [refusal(RM_01, place, "a paragraph that starts with its ID and a dot", text)];
  return isId(id) ? [] : [refusal(RM_02, place, GRAMMAR, id)];
}

/** A paragraph (RM-Z03): one line that starts with its ID and a dot, and the field it carries, if any. */
export function prose(input: { readonly text: string; readonly field?: Field | undefined }, place: Place = ROOT): Result<Prose> {
  const { text, field } = input;
  const block = { type: "prose", text } as const;
  const found = [...(isOneLine(text) ? [] : [refusal(LG_42, place, ONE_LINE, text)]), ...proseIdRefusals(text, place), ...fieldRefusals(block, field, place)];
  return made({ ...block, ...field } as Prose, found);
}

/** RM-01, RM-02: the first cell of a row is the ID of a rule. */
function ruleIdRefusals(id: string, place: Place): Rejection[] {
  if (isRuleId(id)) return [];
  return isIdLike(id) ? [refusal(RM_02, place, RULE_ID, id)] : [refusal(RM_01, place, "a row whose first cell is its ID", id)];
}

/** A row of a table of clauses (RM-01): its cells, the ID of a rule first, and the field it carries, if any. */
export function clause(input: { readonly cells: readonly string[]; readonly field?: Field | undefined }, place: Place = ROOT): Result<Clause> {
  const { cells, field } = input;
  const block = { type: "clause", cells } as const;
  const found = [...rowRefusals(cells, place), ...ruleIdRefusals(cells[0] ?? "", place), ...fieldRefusals(block, field, place)];
  return made({ ...block, ...field } as Clause, found);
}

/** LG-42, RM-02: the line that opens an example reads back as its language and ID, a `Z` one. */
function openRefusals(lang: string, id: string, place: Place): Rejection[] {
  const open = fenceOpen(lang, id);
  const read = readFenceOpen(open);
  if (!isOneLine(open) || !isLang(lang) || !isIdLike(id) || read.lang !== lang || read.id !== id) return [refusal(LG_42, place, FENCE_OPEN_FORM, open)];
  return isZBlockId(id) ? [] : [refusal(RM_02, place, Z_BLOCK_ID, id)];
}

type ExampleInput = { readonly lang: string; readonly id: string; readonly text: string; readonly field?: Field | undefined };

/** An example (RM-Z03, G-25): its language, its ID, its text verbatim, and the field it carries, if any. */
export function example(input: ExampleInput, place: Place = ROOT): Result<Example> {
  const { lang, id, text, field } = input;
  const block = { type: "example", id, lang, text } as const;
  const found = [...openRefusals(lang, id, place), ...(isFencedText(text) ? [] : [refusal(LG_42, place, FENCED_TEXT_FORM, text)]), ...fieldRefusals(block, field, place)];
  return made({ ...block, ...field } as Example, found);
}

/** LG-42: a row of a table of clauses has the header's cells; only the last row carries a field — the table ends there. */
function rowOfTable(row: Clause, columns: number, last: boolean, place: Place): Rejection[] {
  const field = row.table !== undefined || row.list !== undefined;
  return [
    ...(row.cells.length === columns ? [] : [refusal(LG_42, place, `${columns} cells, as the header has`, row.cells)]),
    ...(field && !last ? [refusal(LG_42, place, "a field after the last row of its table only", row.cells)] : []),
  ];
}

/** A table of clauses (RM-01, RM-Z03): its header and its rows, one row or more. */
export function clauses(input: { readonly header: readonly string[]; readonly rows: readonly Clause[] }, place: Place = ROOT): Result<Clauses> {
  const { header, rows } = input;
  const found = [
    ...rowRefusals(header, under(place, "/header")),
    ...(rows.length > 0 ? [] : [refusal(RM_01, place, "a table of clauses: rows whose first cell is an ID", "no rows")]),
    ...rows.flatMap((row, k) => rowOfTable(row, header.length, k === rows.length - 1, under(place, `/rows/${k}`))),
  ];
  return made({ type: "clauses", header, rows } as Clauses, found);
}

/** A document being checked: the refusals so far and the place of the block of each ID read (RM-01). */
type Walk = { readonly found: Rejection[]; readonly ids: Map<string, string> };

/** RM-01: one ID — one block; a block whose ID an earlier block has is refused at its place. */
function oneBlock(walk: Walk, block: Block, place: Place): void {
  const id = idOf(block);
  const first = walk.ids.get(id);
  if (first === undefined) walk.ids.set(id, place.path);
  else walk.found.push(refusal(RM_01, place, `one block per ID; ${id} is the block at ${first}`, id));
}

/** LG-42, RM-01: a block or a table of clauses comes before the subsections of its section — or parse reads it into the last of them. */
function blockOf(walk: Walk, item: Exclude<Item, Section>, afterSection: boolean, place: Place): void {
  if (afterSection) walk.found.push(refusal(LG_42, place, "the blocks of a section before its subsections", item.type));
  if (item.type !== "clauses") return oneBlock(walk, item, place);
  item.rows.forEach((row, k) => oneBlock(walk, row, under(place, `/rows/${k}`)));
}

/** LG-42: a subsection is deeper than its section and not deeper than the subsection before it — or parse nests it there. */
function levelRefusals(section: Section, above: number, before: number, place: Place): Rejection[] {
  const ok = Number.isInteger(section.level) && section.level > above && section.level <= before;
  return ok ? [] : [refusal(LG_42, under(place, "/level"), `a level from ${above + 1} to ${before}`, section.level)];
}

/** LG-42: a heading of its level reads back as it is. */
function headingRefusals(section: Section, place: Place): Rejection[] {
  const read = readHeading(headingLine(section.level, section.heading));
  const ok = isOneLine(section.heading) && read?.level === section.level && read.text === section.heading;
  return ok ? [] : [refusal(LG_42, under(place, "/heading"), HEADING_FORM, section.heading)];
}

/** LG-42, RM-01: a section — its heading, its blocks before its subsections, and each block's ID its own. */
function sectionOf(walk: Walk, section: Section, place: Place): void {
  walk.found.push(...headingRefusals(section, place));
  let previous: number | null = null;
  section.items.forEach((item, i) => {
    const at = under(place, `/items/${i}`);
    if (item.type !== "section") return blockOf(walk, item, previous !== null, at);
    const levels = levelRefusals(item, section.level, previous ?? DEEPEST_LEVEL, at);
    walk.found.push(...levels);
    if (levels.length === 0) sectionOf(walk, item, at);
    previous = item.level;
  });
}

/** A document (RM-Z03, LG-42): the section of level 1, its heading and items checked whole, every ID once (RM-01). */
export function document(input: { readonly heading: string; readonly items: readonly Item[] }, place: Place = ROOT): Result<Document> {
  const section: Section = { type: "section", heading: input.heading, level: 1, items: input.items };
  const walk: Walk = { found: [], ids: new Map() };
  sectionOf(walk, section, place);
  return made(section as Document, walk.found);
}
