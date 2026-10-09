// The import of md into a proposal (LG-42, RM-Z03, RM-07): each document is
// parsed at its place — its path, so a refusal names the file and the line —
// and becomes entities of std: a block per ID (`clause`, `prose`, `example`),
// a `section` per heading, the document the section of level 1. The text is
// kept verbatim; the IDs it mentions become floating references. A string not
// in NFC is refused by canon (KR-10) when a block becomes an intent, never
// normalised. Signature, `expected` against a tail and landing are the
// caller's (S0-21, S0-29): every intent here is a new entity.
import { canon, compareText, refused, reject, rejectionsOf, type JsonObject, type JsonValue, type Rejection, type Result } from "../kernel/index.js";
import type { Intent } from "../ledger/index.js";
import { idOf, type Block, type Item, type Section } from "./model.js";
import { parse } from "./parse.js";
import { RM_01 } from "./rules.js";

/** RM-Z03: the namespace of the entities of the design. */
const NAMESPACE = "lattice";

/** TY-Z03: the types of std an imported entity is of. */
const TYPES = { clause: "std/clause@1", prose: "std/prose@1", example: "std/example@1", section: "std/section@1" } as const;

/** RM-Z03: the slug of a heading or of a table header — lower case, each run outside `a-z0-9` one `-`, none at either end. */
const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "")
    .join("-");

/** RM-Z03: the entity of an ID — `lattice/<id in lower case>`. */
const entityOf = (id: string): string => `${NAMESPACE}/${id.toLowerCase()}`;

/** RM-Z03: the entity of a document — `lattice/<file name without .md, in lower case>`; the file is the last segment of its path. */
const documentOf = (path: string): string => `${NAMESPACE}/${path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "").toLowerCase()}`;

/** RM-Z03, Q-02: the entity of a section at any depth — `<entity of its document>.<slug of its heading>`. */
const sectionOf = (document: string, heading: string): string => `${document}.${slugOf(heading)}`;

/** RM-Z03: an ID in text, `<PREFIX>-<NN>` or `<PREFIX>-Z<NN>` (RM-02), or a range `A…B` of IDs of one prefix and kind. */
const MENTION = /\b([A-Z]{2})-(Z?)(\d{2})(?:…\1-\2(\d{2}))?\b/g;

/** RM-Z03: an ID inside inline code is text, not a reference. */
const INLINE_CODE = /`[^`]*`/g;

/** Every ID of a range, from its lower end to its higher, whichever is written first. */
function rangeOf(stem: string, from: number, to: number): string[] {
  const low = Math.min(from, to);
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, k) => `${stem}${String(low + k).padStart(2, "0")}`);
}

/** RM-Z03: the IDs a text mentions — each ID, and each ID of a range — outside inline code. */
const mentioned = (text: string): string[] =>
  [...text.replace(INLINE_CODE, "").matchAll(MENTION)].flatMap(([id, prefix, z, from, to]) => (to === undefined ? [id] : rangeOf(`${prefix}-${z}`, Number(from), Number(to))));

/** The text of a block that may mention IDs: its cells or its paragraph — an example's text is never parsed — and its field. */
function textOf(block: Block): readonly string[] {
  const own = block.type === "clause" ? block.cells : block.type === "prose" ? [block.text] : [];
  const field = block.table !== undefined ? [...block.table.header, ...block.table.rows.flat()] : (block.list ?? []);
  return [...own, ...field];
}

/** LG-42, RM-Z03: the floating references, label `about`, to the IDs a block mentions other than its own, sorted (§5.5). */
function refsOf(block: Block): readonly string[] {
  const own = idOf(block);
  const ids = new Set(textOf(block).flatMap(mentioned));
  ids.delete(own);
  return [...ids].map(entityOf).sort(compareText);
}

/** What import writes: an entity of a type of std with its body; `block` — the ID of a block, `null` for a section. */
type Written = { readonly id: string; readonly type: string; readonly body: JsonObject; readonly block: string | null };

/** The body of a block: its own fields, its field `table` or `list` (G-01) and its `refs`, when it mentions an ID. */
function blockBody(block: Block, header: readonly string[]): JsonObject {
  const own: JsonObject =
    block.type === "clause"
      ? { cells: block.cells.map((text, i) => ({ column: slugOf(header[i] ?? ""), text })) }
      : block.type === "prose"
        ? { text: block.text }
        : { lang: block.lang, text: block.text };
  const field: JsonObject = block.table !== undefined ? { table: { header: block.table.header, rows: block.table.rows } } : block.list !== undefined ? { list: block.list } : {};
  const refs = refsOf(block);
  return { ...own, ...field, ...(refs.length === 0 ? {} : { refs }) };
}

function blockOf(block: Block, header: readonly string[]): Written {
  const id = idOf(block);
  return { id: entityOf(id), type: TYPES[block.type], body: blockBody(block, header), block: id };
}

/** LG-42: the items of a section — a reference to each block and subsection in order, the header of each table it holds. */
function itemsOf(item: Item, document: string): JsonValue[] {
  if (item.type === "section") return [{ item: "block", ref: sectionOf(document, item.heading) }];
  if (item.type !== "clauses") return [{ item: "block", ref: entityOf(idOf(item)) }];
  return [{ item: "table", header: item.header }, ...item.rows.map((row) => ({ item: "block", ref: entityOf(idOf(row)) }))];
}

/** A section and, in document order, everything it holds: its blocks, the rows of its tables, its subsections. */
function sectionWritten(section: Section, id: string, document: string): Written[] {
  const own: Written = { id, type: TYPES.section, body: { heading: section.heading, level: section.level, items: section.items.flatMap((i) => itemsOf(i, document)) }, block: null };
  const inner = section.items.flatMap((item): Written[] => {
    if (item.type === "section") return sectionWritten(item, sectionOf(document, item.heading), document);
    return item.type === "clauses" ? item.rows.map((row) => blockOf(row, item.header)) : [blockOf(item, [])];
  });
  return [own, ...inner];
}

/** RM-01: one ID — one block across the documents; a block whose ID a block of an earlier document has is refused at its file. */
function twice(written: readonly { readonly path: string; readonly entities: readonly Written[] }[]): Rejection[] {
  const first = new Map<string, string>();
  return written.flatMap(({ path, entities }) =>
    entities.flatMap(({ block }) => {
      if (block === null) return [];
      const at = first.get(block);
      if (at === undefined) first.set(block, path);
      return at === undefined ? [] : [reject(RM_01, { intent: null, path, expected: `one block per ID; ${block} is a block of ${at}`, got: block })];
    }),
  );
}

/**
 * LG-42, RM-Z03: the intents of one proposal that write the documents — each `{path, bytes}`, parsed at its place
 * `{intent: null, path}` — as new entities written at `at`, in document order; or the refusals of every document: the
 * codec's at the path and line, RM-01 across documents at the path, KR-10 of canon in the body of an intent.
 */
export function importMd(documents: readonly { readonly path: string; readonly bytes: Uint8Array }[], at: string): Result<Intent[]> {
  const parsed = documents.map(({ path, bytes }) => ({ path, out: parse(bytes, { intent: null, path }) }));
  const written = parsed.flatMap(({ path, out }) => (out.ok ? [{ path, entities: sectionWritten(out.value, documentOf(path), documentOf(path)) }] : []));
  const entities = written.flatMap((w) => w.entities);
  const found = [
    ...parsed.flatMap(({ out }) => rejectionsOf(out)),
    ...twice(written),
    ...entities.flatMap(({ id, body }) => rejectionsOf(canon(body, { intent: id, path: "/body" }))),
  ];
  return refused<Intent[]>(found) ?? { ok: true, value: entities.map(({ id, type, body }) => ({ op: "entity", id, type, expected: null, at, body })) };
}
