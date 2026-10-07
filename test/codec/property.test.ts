// The property of the codec (LG-42): on generated documents, `parse` reads
// back exactly what `print` wrote — the model is the md format, both ways.
// The generator knows the model only through its builders: it offers blocks,
// tables of clauses and documents of any shape and keeps what the builders
// accept. Which block may carry a field, which ID a block takes, how many
// cells a row has, that a field ends its table, that text is one line, that a
// section's blocks come before its subsections, which levels they take and
// that no two blocks share an ID are the model's to say (RM-01, RM-02,
// LG-42), not the generator's. A check that `parse` makes through the same
// builders — the ID of a paragraph, the line that opens an example — a round
// trip cannot show; `model.test.ts` and the fixtures show it.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clause, clauses, document, example, parse, print, prose, type Clause, type Field, type Item, type Section, type Table } from "../../src/codec/index.js";
import type { Result } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";

type Ok<T> = Extract<Result<T>, { readonly ok: true }>;

/** What a builder accepts is kept, what it refuses is dropped: the model decides. */
const built = <T>(arb: fc.Arbitrary<Result<T>>): fc.Arbitrary<T> => arb.filter((out): out is Ok<T> => out.ok).map((out) => out.value);

const PREFIXES = ["AA", "KR", "LG", "RM"] as const;

/** An ID of either kind, and now and then one off the grammar. */
const id = fc.oneof(
  { weight: 12, arbitrary: fc.tuple(fc.constantFrom(...PREFIXES), fc.boolean(), fc.integer({ min: 0, max: 99 })).map(([prefix, z, n]) => `${prefix}-${z ? "Z" : ""}${String(n).padStart(2, "0")}`) },
  { weight: 1, arbitrary: fc.constantFrom("AA-1", "aa-01", "AA-Z1") },
);

/** Words of inline text as the corpus has them: inline code, an escaped pipe, links, ranges, typography. */
const word = fc.constantFrom("a", "rule", "`KR-10`", "\\|", "`a \\| b`", "[x](y.md#z)", "KR-04…KR-13", "…", "—", "→", "**b**", "x:", "#", "-", "1.");
/** Now and then a word md does not keep as it is: a line break, a space at an end. */
const breaking = fc.constantFrom("a\nb", "a ", " a");
const inline = fc.array(fc.oneof({ weight: 40, arbitrary: word }, { weight: 1, arbitrary: breaking }), { minLength: 1, maxLength: 5 }).map((ws) => ws.join(" "));
/** A cell: text, or now and then an ID — a row of which is a clause, not a row of a field table. */
const cell = fc.oneof({ weight: 8, arbitrary: inline }, { weight: 1, arbitrary: id });
/** Cells of a row or a header, as many as they come — how many a table keeps is the model's to say. */
const cells = fc.array(cell, { minLength: 1, maxLength: 3 });

/** The end of the text of a block, whatever field it carries. */
const ending = fc.constantFrom("", ":");

const table: fc.Arbitrary<Table> = fc.record({ header: cells, rows: fc.array(cells, { maxLength: 2 }) });
const field: fc.Arbitrary<Field | undefined> = fc.option(
  fc.oneof(
    table.map((t) => ({ table: t })),
    fc.array(inline, { maxLength: 3 }).map((l) => ({ list: l })),
  ),
  { nil: undefined, freq: 2 },
);

/** A paragraph: its ID and a dot, now and then none, then its text. */
const start = fc.option(id.map((i) => `${i}. `), { nil: "", freq: 12 });
const proseItem: fc.Arbitrary<Item> = built(fc.tuple(start, inline, ending, field).map(([s, t, e, f]) => prose({ text: `${s}${t}${e}`, field: f })));

const line = fc.constantFrom("", "{ }", "a  ", "```json", "```", "| x |", "# h", "\t", "- a");
const last = fc.constantFrom([], ["k"], ["k:"]);
const exampleItem: fc.Arbitrary<Item> = built(
  fc
    .tuple(id, fc.constantFrom("json", "text", "ts", "Text"), fc.array(line, { maxLength: 4 }), last, field)
    .map(([i, lang, lines, end, f]) => example({ lang, id: i, text: [...lines, ...end].map((l) => `${l}\n`).join(""), field: f })),
);

/** A row: its ID, then cells, the last of them with its ending. */
const row: fc.Arbitrary<Clause> = built(
  fc.tuple(id, fc.array(cell, { maxLength: 2 }), ending, field).map(([i, rest, e, f]) => {
    const all = [i, ...rest];
    return clause({ cells: [...all.slice(0, -1), `${all.at(-1) ?? ""}${e}`], field: f });
  }),
);

const clausesItem: fc.Arbitrary<Item> = built(fc.tuple(cells, fc.array(row, { maxLength: 3 })).map(([header, rows]) => clauses({ header, rows })));

const block: fc.Arbitrary<Item> = fc.oneof(proseItem, exampleItem, clausesItem);

/**
 * A section: its blocks and tables, its subsections — one or two levels
 * deeper, now and then at its own level — and now and then more blocks among
 * or after the subsections. Which order and which levels md keeps is the
 * model's to say; strays are a few, not a shuffle of all items, so that the
 * documents the model keeps stay large.
 */
function section(level: number, depth: number): fc.Arbitrary<Section> {
  const deeper = fc.oneof({ weight: 1, arbitrary: fc.constant(0) }, { weight: 6, arbitrary: fc.integer({ min: 1, max: 2 }) });
  const sub = deeper.chain((k) => section(level + k, depth - 1));
  const subs = depth === 0 ? fc.constant([]) : fc.array(sub, { maxLength: 2 });
  const strays = fc.oneof({ weight: 3, arbitrary: fc.constant([]) }, { weight: 1, arbitrary: fc.array(block, { minLength: 1, maxLength: 2 }) });
  return fc.tuple(inline, fc.array(block, { maxLength: 4 }), subs, strays, fc.nat()).map(([heading, blocks, inner, more, at]): Section => {
    const k = at % (inner.length + 1);
    return { type: "section", heading, level, items: [...blocks, ...inner.slice(0, k), ...more, ...inner.slice(k)] };
  });
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
