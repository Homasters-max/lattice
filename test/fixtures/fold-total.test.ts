// LG-36, LG-39: fold is total — it rejects nothing and throws on nothing, on
// the commits apply rejects too. Every input of a trigger fixture of this
// repository is folded: each object it holds as a record — its own `id`,
// `rev`, `type` and `body` where it has them — and each type body it holds as
// a type of the same commit, so references, unique values and unions meet what
// the refusals were made of.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/kernel/index.js";
import { fold, type Commit } from "../../src/ledger/index.js";
import { viewOf, withDelta } from "../../src/ledger/rows.js";
import { loadFolders } from "./load.js";

/** A JSON object of a fixture. */
type Obj = { readonly [key: string]: unknown };

/** Every object a value holds, itself among them, and those in strings that hold JSON — a line of a store. */
function objectsIn(value: unknown): Obj[] {
  const out: Obj[] = [];
  const pending: unknown[] = [value];
  for (let v = pending.pop(); v !== undefined; v = pending.pop()) {
    if (typeof v === "string" && v.startsWith("{")) pending.push(parsed(v));
    if (typeof v !== "object" || v === null) continue;
    if (!Array.isArray(v)) out.push(v as Obj);
    pending.push(...(Object.values(v) as unknown[]));
  }
  return out;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const HEADER = { hash: "sha256:0", by: "01JB2X00000000000000000SES", at: "2026-10-06T11:00:00.000000Z" };

/** The records of a fixture input: each object as a record of its own type, or of the first type it holds; each type body as a type. */
function recordsOf(input: unknown): Commit["records"] {
  const objects = objectsIn(input);
  const types = objects.filter((o) => "schema" in o).map((body, i) => ({ ...HEADER, id: `fx/t${i}`, rev: 1, type: "core/type@1", body: body as JsonValue }));
  const named = objects.flatMap((o) =>
    Object.entries(o.types ?? {}).map(([ref, body]) => ({ ...HEADER, id: ref.split("@")[0] ?? ref, rev: Number(ref.split("@")[1] ?? 1), type: "core/type@1", body: body as JsonValue })),
  );
  const records = objects.map((o, i) => ({
    ...HEADER,
    id: typeof o.id === "string" ? o.id : `fx/r${i}`,
    ...(o.op === "event" ? {} : { rev: typeof o.rev === "number" ? o.rev : 1 }),
    type: typeof o.type === "string" ? o.type : "fx/t0@1",
    body: (o.body ?? o) as JsonValue,
  }));
  return [...types, ...named, ...records];
}

const commitOf = (seq: number, records: Commit["records"]): Commit => ({
  seq,
  prev: null,
  kernel: "0",
  base: seq - 1,
  proposal: "sha256:0",
  proposal_sig: null,
  by: HEADER.by,
  at: HEADER.at,
  request: null,
  sig: null,
  records,
});

describe("fold is total on the inputs of refusals (LG-36)", () => {
  it("LG-36: folds every trigger input of every rule fixture without a throw, as one commit and again record by record", () => {
    const cases = loadFolders().flatMap((f) => (f.trigger ?? []).map((c) => [`${f.name}/${c.name}`, c.data] as const));
    expect(cases.length).toBeGreaterThan(50);
    for (const [name, data] of cases) {
      const records = recordsOf(data);
      const first = fold(viewOf(0, []), commitOf(1, records), []);
      let rows = withDelta([], first);
      for (const [i, r] of records.entries()) rows = withDelta(rows, fold(viewOf(i + 1, rows), commitOf(i + 2, [r]), []));
      expect([name, rows.length >= first.length]).toEqual([name, true]);
    }
  });
});
