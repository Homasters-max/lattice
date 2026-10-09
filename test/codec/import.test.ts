// The import of md into a proposal (S0-26; LG-42, RM-Z03, RM-07, KR-10): the
// documents of docs/design become the intents of one proposal — a block per ID,
// a section per heading, a document per file — and the floating references
// their text mentions. The corpus is the design itself (SL-02, RM-03).
import { describe, expect, it } from "vitest";
import { importMd, parse, type Section } from "../../src/codec/index.js";
import { checkAgainstType, isJsonObject, rejectionsOf, ROOT, type JsonValue } from "../../src/kernel/index.js";
import type { Intent } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { knowledge, repoRoot } from "../support/files.js";
import { program } from "../support/program.js";
import { std } from "../ledger/std-sources.js";

const AT = "2026-10-09T12:00:00.000000Z";
const md = (...lines: string[]): string => `${lines.join("\n")}\n`;
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Documents by file name, at their place in the tree: /docs/design/<file>; the list and each document frozen (§1.5) —
 * bytes cannot be frozen, a typed array with elements refuses `Object.freeze`.
 */
const documents = (files: { readonly [name: string]: string }) =>
  Object.freeze(Object.entries(files).map(([name, text]) => Object.freeze({ path: `/docs/design/${name}`, bytes: encode(text) })));

function imported(files: { readonly [name: string]: string }): Intent[] {
  const out = importMd(documents(files), AT);
  if (!out.ok) throw new Error(out.rejections.map((r) => `${r.rule} ${String(r.intent)} ${r.path}`).join("; "));
  return out.value;
}

const refusals = (files: { readonly [name: string]: string }): (string | null)[][] => {
  const out = importMd(documents(files), AT);
  return out.ok ? [] : out.rejections.map((r) => [r.rule, r.intent, r.path]);
};

const bodyOf = (intents: readonly Intent[], id: string): JsonValue | undefined => intents.find((i) => i.id === id)?.body;

const FILES = knowledge
  .list("")
  .filter((f) => f.endsWith(".md"))
  .sort();

let corpus: Intent[] | undefined;

/** The whole of docs/design imported once: every file at its place /docs/design/<file>. */
function design(): Intent[] {
  if (corpus !== undefined) return corpus;
  const out = importMd(FILES.map((f) => ({ path: `/docs/design/${f}`, bytes: knowledge.bytes(f) })), AT);
  if (!out.ok) throw new Error(out.rejections.map((r) => `${r.rule} ${String(r.intent)} ${r.path} ${JSON.stringify(r.got)}`).join("; "));
  corpus = out.value;
  return corpus;
}

const typeCount = (intents: readonly Intent[]) => {
  const count = new Map<string, number>();
  for (const i of intents) count.set(i.type, (count.get(i.type) ?? 0) + 1);
  return Object.fromEntries([...count].sort(([a], [b]) => (a < b ? -1 : 1)));
};

/** What the model of a section holds, by kind: rows of tables of clauses, paragraphs, examples, sections. */
function modelCount(s: Section): { clause: number; prose: number; example: number; section: number } {
  return s.items.reduce(
    (n, i) => {
      if (i.type === "section") {
        const inner = modelCount(i);
        return { clause: n.clause + inner.clause, prose: n.prose + inner.prose, example: n.example + inner.example, section: n.section + inner.section };
      }
      if (i.type === "clauses") return { ...n, clause: n.clause + i.rows.length };
      return i.type === "prose" ? { ...n, prose: n.prose + 1 } : { ...n, example: n.example + 1 };
    },
    { clause: 0, prose: 0, example: 0, section: 1 },
  );
}

const refsOf = (body: JsonValue): readonly JsonValue[] => (isJsonObject(body) && Array.isArray(body.refs) ? (body.refs as readonly JsonValue[]) : []);

describe("the corpus: docs/design imported into one proposal (S0-26)", () => {
  it("LG-42, RM-07: every file of docs/design is imported into the intents of one proposal without a refusal", () => {
    const intents = design();
    expect(intents.length).toBeGreaterThan(FILES.length);
    expect(new Set(intents.map((i) => i.id)).size).toBe(intents.length);
    expect(intents.every((i) => i.op === "entity" && i.expected === null && i.at === AT)).toBe(true);
  });

  it("RM-01, RM-Z03: the blocks by type are the model's, and all of them together are the definitions lint-ids counts", () => {
    const counts = FILES.map((f) => {
      const out = parse(knowledge.bytes(f), { intent: null, path: `/${f}` });
      if (!out.ok) throw new Error(`bug: ${f} parses`);
      return modelCount(out.value);
    });
    const sum = (k: "clause" | "prose" | "example" | "section") => counts.reduce((n, c) => n + c[k], 0);
    expect(typeCount(design())).toEqual({ "std/clause@1": sum("clause"), "std/example@1": sum("example"), "std/prose@1": sum("prose"), "std/section@1": sum("section") });
    const lint = program("discussion/tools/lint-ids.mjs").run(["docs/design"], { cwd: repoRoot });
    const defined = Number(/определений (\d+)/.exec(lint.stdout)?.[1]);
    expect([lint.status, sum("clause") + sum("prose") + sum("example")]).toEqual([0, defined]);
  });

  it("RF-03: the target of every reference — a ref of a block, an item of a section — is imported in the same proposal", () => {
    const intents = design();
    const ids = new Set(intents.map((i) => i.id));
    const items = (body: JsonValue): JsonValue[] => (isJsonObject(body) && Array.isArray(body.items) ? body.items.flatMap((i: JsonValue) => (isJsonObject(i) && i.item === "block" ? [i.ref ?? null] : [])) : []);
    const targets = intents.flatMap((i) => [...refsOf(i.body), ...items(i.body)]);
    expect(targets.length).toBeGreaterThan(1000);
    expect(targets.filter((t) => typeof t !== "string" || !ids.has(t))).toEqual([]);
  });

  it("TY-Z03, G-01: the body of every intent passes the check of its type of std (S0-08)", () => {
    const refused = design().flatMap((i) => rejectionsOf(checkAgainstType(deepFreeze({ type: i.type, rev: 1, body: i.body }), std().resolve, ROOT)).map((r) => [i.id, r.rule, r.path]));
    expect(refused).toEqual([]);
  });

  it("RM-Z03: the clause LG-42 has its cells by column slug, its field table and the IDs it mentions", () => {
    const body = bodyOf(design(), "lattice/lg-42") ?? null;
    expect(body).toMatchObject({ cells: [{ column: "id", text: "LG-42" }, { column: "rule" }], table: { header: ["`md`", "Block"] } });
    expect(refsOf(body)).toContain("lattice/rm-z03");
  });
});

/** A document with a block of each kind, a field of each kind, ranges and an ID in inline code. */
const KERNEL = md(
  "# 02. Kernel",
  "",
  "KR-Z01. The record is KR-04…KR-13, as KR-Z01 says; `KR-20` is text.",
  "",
  "## (Canon) and Hash!",
  "",
  "| ID | Rule (short) |",
  "|---|---|",
  "| KR-01 | One, see KR-02. |",
  "| KR-02 | Two, from KR-03…KR-01: |",
  "",
  "| `md` | Block |",
  "|---|---|",
  "| a row | KR-Z02 |",
  "",
  "```json KR-Z02",
  "{ \"see\": \"KR-01\" }",
  "```",
  "",
  "KR-Z03. A list:",
  "",
  "- first, KR-Z01",
  "- second",
);

describe("blocks (RM-Z03, LG-42)", () => {
  const doc = KERNEL;

  it("RM-Z03: a paragraph with an ID is prose — its text verbatim, the IDs it mentions as refs; a range gives each of its IDs", () => {
    const body = bodyOf(imported({ "02-kernel.md": doc }), "lattice/kr-z01");
    expect(body).toEqual({
      text: "KR-Z01. The record is KR-04…KR-13, as KR-Z01 says; `KR-20` is text.",
      refs: ["lattice/kr-04", "lattice/kr-05", "lattice/kr-06", "lattice/kr-07", "lattice/kr-08", "lattice/kr-09", "lattice/kr-10", "lattice/kr-11", "lattice/kr-12", "lattice/kr-13"],
    });
  });

  it("RM-Z03: a row with an ID is a clause — its cells {column, text} by the slug of the header; a field table is its field", () => {
    const intents = imported({ "02-kernel.md": doc });
    expect(bodyOf(intents, "lattice/kr-01")).toEqual({ cells: [{ column: "id", text: "KR-01" }, { column: "rule-short", text: "One, see KR-02." }], refs: ["lattice/kr-02"] });
    expect(bodyOf(intents, "lattice/kr-02")).toEqual({
      cells: [{ column: "id", text: "KR-02" }, { column: "rule-short", text: "Two, from KR-03…KR-01:" }],
      table: { header: ["`md`", "Block"], rows: [["a row", "KR-Z02"]] },
      refs: ["lattice/kr-01", "lattice/kr-03", "lattice/kr-z02"],
    });
  });

  it("RM-Z03: a fenced block with an ID is an example — its lang and text verbatim, never read for refs; a list is a field", () => {
    const intents = imported({ "02-kernel.md": doc });
    expect(bodyOf(intents, "lattice/kr-z02")).toEqual({ lang: "json", text: "{ \"see\": \"KR-01\" }\n" });
    expect(bodyOf(intents, "lattice/kr-z03")).toEqual({ text: "KR-Z03. A list:", list: ["first, KR-Z01", "second"], refs: ["lattice/kr-z01"] });
  });

  it("RM-Z03: an ID of a range of two kinds or two prefixes is mentioned, the range itself not expanded", () => {
    const intents = imported({ "02-kernel.md": md("# Doc", "", "KR-Z01. See KR-01…KR-Z03 and KR-02…TY-04.", "", "| ID | Rule |", "|---|---|", "| KR-01 | x |", "| KR-02 | x |", "| KR-03 | x |"), "03-types.md": md("# T", "", "TY-Z03. x", "", "TY-Z04. TY-04 is not here:", "", "- KR-Z01 KR-Z02") });
    expect(refsOf(bodyOf(intents, "lattice/kr-z01") ?? null)).toEqual(["lattice/kr-01", "lattice/kr-02", "lattice/kr-z03", "lattice/ty-04"]);
    expect(refsOf(bodyOf(intents, "lattice/ty-z04") ?? null)).toEqual(["lattice/kr-z01", "lattice/kr-z02", "lattice/ty-04"]);
  });

  it("RM-Z03: every intent is an entity of its std type, new — expected null — and written at the time given", () => {
    const intents = imported({ "02-kernel.md": doc });
    expect(intents.map((i) => [i.id, i.type, i.op, i.expected, i.at])).toEqual([
      ["lattice/02-kernel", "std/section@1", "entity", null, AT],
      ["lattice/kr-z01", "std/prose@1", "entity", null, AT],
      ["lattice/02-kernel.canon-and-hash", "std/section@1", "entity", null, AT],
      ["lattice/kr-01", "std/clause@1", "entity", null, AT],
      ["lattice/kr-02", "std/clause@1", "entity", null, AT],
      ["lattice/kr-z02", "std/example@1", "entity", null, AT],
      ["lattice/kr-z03", "std/prose@1", "entity", null, AT],
    ]);
  });
});

describe("sections and ids (RM-Z03, Q-02)", () => {
  const doc = md("# 00. Read Me", "", "RM-Z01. Intro.", "", "## Rules", "", "| ID | Rule |", "|---|---|", "| RM-01 | One. |", "", "### — Deep, deeper —", "", "RM-Z02. Deep.", "", "## Later", "", "RM-Z03. Last.");

  it("RM-Z03: a document is the section of level 1, lattice/<file name without .md, in lower case>", () => {
    const intents = imported({ "README.md": doc });
    expect(bodyOf(intents, "lattice/readme")).toEqual({
      heading: "00. Read Me",
      level: 1,
      items: [
        { item: "block", ref: "lattice/rm-z01" },
        { item: "block", ref: "lattice/readme.rules" },
        { item: "block", ref: "lattice/readme.later" },
      ],
    });
  });

  it("RM-Z03, LG-42: a section — <document>.<slug of its heading> at any depth — holds its blocks, the header of each table and its subsections in order", () => {
    const intents = imported({ "README.md": doc });
    expect(bodyOf(intents, "lattice/readme.rules")).toEqual({
      heading: "Rules",
      level: 2,
      items: [
        { item: "table", header: ["ID", "Rule"] },
        { item: "block", ref: "lattice/rm-01" },
        { item: "block", ref: "lattice/readme.deep-deeper" },
      ],
    });
    expect(bodyOf(intents, "lattice/readme.deep-deeper")).toEqual({ heading: "— Deep, deeper —", level: 3, items: [{ item: "block", ref: "lattice/rm-z02" }] });
  });

  it("RM-Z03: the file name is the last segment of the path, without .md only at its end", () => {
    const intents = imported({ "notes.mdx.md": md("# A", "", "KR-Z01. x"), "md-notes.md": md("# B", "", "KR-Z02. x") });
    expect(intents.filter((i) => i.type === "std/section@1").map((i) => i.id)).toEqual(["lattice/notes.mdx", "lattice/md-notes"]);
  });
});

describe("refusals (LG-42, RM-01, KR-10)", () => {
  it("LG-42: a refusal of the codec in one of the files names the path of that file and its line", () => {
    expect(refusals({ "a.md": md("# A", "", "KR-Z01. Fine."), "b.md": md("# B", "", "KR-Z02. Trailing. ") })).toEqual([["LG-42", null, "/docs/design/b.md/3"]]);
  });

  it("LG-42: the refusals of every file are found, not only the first file's", () => {
    expect(refusals({ "a.md": md("# A", "", "KR-Z01. x "), "b.md": md("# B", "", "", "KR-Z02. x") })).toEqual([
      ["LG-42", null, "/docs/design/a.md/3"],
      ["LG-42", null, "/docs/design/b.md/3"],
    ]);
  });

  it("RM-01: one ID — one block across the documents; the second is refused at the path of its file", () => {
    expect(refusals({ "a.md": md("# A", "", "KR-Z01. One."), "b.md": md("# B", "", "TY-Z01. x", "", "KR-Z01. Again.") })).toEqual([["RM-01", null, "/docs/design/b.md"]]);
  });

  it("KR-10: a string not in NFC is refused when the block becomes an intent, never normalised", () => {
    const nfd = "KR-Z01. Cafe\u0301.";
    expect(refusals({ "a.md": md("# A", "", nfd) })).toEqual([["KR-10", "lattice/kr-z01", "/body/text"]]);
    expect(refusals({ "a.md": md("# Cafe\u0301", "", "KR-Z01. x") })).toEqual([["KR-10", "lattice/a", "/body/heading"]]);
    expect(bodyOf(imported({ "a.md": md("# A", "", "KR-Z01. Caf\u00e9.") }), "lattice/kr-z01")).toEqual({ text: "KR-Z01. Caf\u00e9." });
  });
});
