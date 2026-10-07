// The property of the codec (LG-42): on generated documents, `parse` reads
// back exactly what `print` wrote — the model is the md format, both ways.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, print, type Block, type Item, type Section, type Table } from "../../src/codec/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

type Field = { readonly table?: Table; readonly list?: readonly string[] };

const id = fc
  .tuple(fc.constantFrom("AA", "KR", "LG", "RM"), fc.boolean(), fc.integer({ min: 0, max: 99 }))
  .map(([prefix, z, n]) => `${prefix}-${z ? "Z" : ""}${String(n).padStart(2, "0")}`);

/** Words of inline text as the corpus has them: inline code, an escaped pipe, links, ranges, typography. */
const word = fc.constantFrom("a", "rule", "`KR-10`", "\\|", "`a \\| b`", "[x](y.md#z)", "KR-04…KR-13", "…", "—", "→", "**b**", "x:", "#", "-", "1.");
const inline = fc.array(word, { minLength: 1, maxLength: 5 }).map((ws) => ws.join(" "));
const cells = (n: number) => fc.array(inline, { minLength: n, maxLength: n });

const table: fc.Arbitrary<Table> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.record({ header: cells(n), rows: fc.array(cells(n), { maxLength: 2 }) }));
const field: fc.Arbitrary<Field | undefined> = fc.option(
  fc.oneof(
    table.map((t) => ({ table: t })),
    fc.array(inline, { minLength: 1, maxLength: 3 }).map((l) => ({ list: l })),
  ),
  { nil: undefined },
);

/** A block that carries a field ends its text with ":" (RM-Z03, G-24). */
const colon = (f: Field | undefined): string => (f === undefined ? "" : ":");

const prose = fc.tuple(id, inline, field).map(([i, t, f]): Block => ({ type: "prose", id: i, text: `${i}. ${t}${colon(f)}`, ...f }));

const line = fc.constantFrom("", "{ }", "a  ", "```json", "| x |", "# h", "\t", "- a");
const example = fc
  .tuple(id, fc.constantFrom("json", "text", "ts"), fc.array(line, { maxLength: 4 }), field)
  .map(([i, lang, lines, f]): Block => ({ type: "example", id: i, lang, text: [...lines, ...(f === undefined ? [] : ["k:"])].map((l) => `${l}\n`).join(""), ...f }));

/** A header and its clauses; only the last clause may carry a field — the table ends there. */
const clauses: fc.Arbitrary<Item[]> = fc.integer({ min: 2, max: 3 }).chain((n) =>
  fc.tuple(cells(n), fc.array(fc.tuple(id, cells(n - 1)), { minLength: 1, maxLength: 3 }), field).map(([header, rows, f]) => [
    { type: "header", cells: header },
    ...rows.map(([i, rest], k): Item => {
      const last = k === rows.length - 1 && f !== undefined;
      const body = last ? [...rest.slice(0, -1), `${rest.at(-1) ?? ""}:`] : rest;
      return { type: "clause", id: i, cells: [i, ...body], ...(last ? f : {}) };
    }),
  ]),
);

const chunk: fc.Arbitrary<Item[]> = fc.oneof(
  prose.map((b) => [b]),
  example.map((b) => [b]),
  clauses,
);

/** A section: its blocks and tables first, then its subsections, one level deeper. */
function section(level: number, depth: number): fc.Arbitrary<Section> {
  const subs = depth === 0 ? fc.constant([]) : fc.array(section(level + 1, depth - 1), { maxLength: 2 });
  return fc
    .tuple(inline, fc.array(chunk, { maxLength: 4 }), subs)
    .map(([heading, items, inner]): Section => ({ type: "section", heading, level, items: [...items.flat(), ...inner] }));
}

describe("the codec both ways (LG-42)", () => {
  it("LG-42: parse(print(d)) is d for generated documents", () => {
    fc.assert(
      fc.property(section(1, 3), (doc) => {
        expect(parse(print(deepFreeze(doc)))).toEqual({ ok: true, value: doc });
      }),
      { numRuns: 300 },
    );
  });
});
