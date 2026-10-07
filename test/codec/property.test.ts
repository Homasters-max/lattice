// The property of the codec (LG-42): on generated documents, `parse` reads
// back exactly what `print` wrote — the model is the md format, both ways.
// The generator knows the model only through its builders: it offers blocks,
// tables of clauses and documents of any shape and keeps what the builders
// accept. Which block may carry a field, which ID a row or an example takes,
// that a field ends its table and that no two blocks share an ID are the
// model's to say (RM-01, RM-02, LG-42), not the generator's.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clause, clauses, document, example, parse, print, prose, type Clause, type Field, type Item, type Section, type Table } from "../../src/codec/index.js";
import type { Result } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

type Ok<T> = Extract<Result<T>, { readonly ok: true }>;

/** What a builder accepts is kept, what it refuses is dropped: the model decides. */
const built = <T>(arb: fc.Arbitrary<Result<T>>): fc.Arbitrary<T> => arb.filter((out): out is Ok<T> => out.ok).map((out) => out.value);

const PREFIXES = ["AA", "KR", "LG", "RM"] as const;

const id = fc
  .tuple(fc.constantFrom(...PREFIXES), fc.boolean(), fc.integer({ min: 0, max: 99 }))
  .map(([prefix, z, n]) => `${prefix}-${z ? "Z" : ""}${String(n).padStart(2, "0")}`);

/** Words of inline text as the corpus has them: inline code, an escaped pipe, links, ranges, typography. */
const word = fc.constantFrom("a", "rule", "`KR-10`", "\\|", "`a \\| b`", "[x](y.md#z)", "KR-04…KR-13", "…", "—", "→", "**b**", "x:", "#", "-", "1.");
const inline = fc.array(word, { minLength: 1, maxLength: 5 }).map((ws) => ws.join(" "));
const cells = (n: number) => fc.array(inline, { minLength: n, maxLength: n });

/** The end of the text of a block, whatever field it carries. */
const ending = fc.constantFrom("", ":");

const table: fc.Arbitrary<Table> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.record({ header: cells(n), rows: fc.array(cells(n), { maxLength: 2 }) }));
const field: fc.Arbitrary<Field | undefined> = fc.option(
  fc.oneof(
    table.map((t) => ({ table: t })),
    fc.array(inline, { minLength: 1, maxLength: 3 }).map((l) => ({ list: l })),
  ),
  { nil: undefined, freq: 2 },
);

const proseItem: fc.Arbitrary<Item> = built(fc.tuple(id, inline, ending, field).map(([i, t, e, f]) => prose({ text: `${i}. ${t}${e}`, field: f })));

const line = fc.constantFrom("", "{ }", "a  ", "```json", "```", "| x |", "# h", "\t", "- a");
const last = fc.constantFrom([], ["k"], ["k:"]);
const exampleItem: fc.Arbitrary<Item> = built(
  fc
    .tuple(id, fc.constantFrom("json", "text", "ts"), fc.array(line, { maxLength: 4 }), last, field)
    .map(([i, lang, lines, end, f]) => example({ lang, id: i, text: [...lines, ...end].map((l) => `${l}\n`).join(""), field: f })),
);

/** A row of `n` cells: its ID, then cells, the last of them with its ending. */
const row = (n: number): fc.Arbitrary<Clause> =>
  built(fc.tuple(id, cells(n - 1), ending, field).map(([i, rest, e, f]) => clause({ cells: [i, ...rest.slice(0, -1), `${rest.at(-1) ?? ""}${e}`], field: f })));

const clausesItem: fc.Arbitrary<Item> = fc
  .integer({ min: 2, max: 3 })
  .chain((n) => built(fc.tuple(cells(n), fc.array(row(n), { minLength: 1, maxLength: 3 })).map(([header, rows]) => clauses({ header, rows }))));

const block: fc.Arbitrary<Item> = fc.oneof(proseItem, exampleItem, clausesItem);

/** A section: its blocks and tables, then its subsections, one level deeper. */
function section(level: number, depth: number): fc.Arbitrary<Section> {
  const subs = depth === 0 ? fc.constant([]) : fc.array(section(level + 1, depth - 1), { maxLength: 2 });
  return fc
    .tuple(inline, fc.array(block, { maxLength: 4 }), subs)
    .map(([heading, items, inner]): Section => ({ type: "section", heading, level, items: [...items, ...inner] }));
}

const doc = built(section(1, 3).map((s) => document({ heading: s.heading, items: s.items })));

describe("the codec both ways (LG-42)", () => {
  it("LG-42: parse(print(d)) is d for generated documents", () => {
    fc.assert(
      fc.property(doc, (d) => {
        expect(parse(print(deepFreeze(d)))).toEqual({ ok: true, value: d });
      }),
      { numRuns: 300 },
    );
  });
});
