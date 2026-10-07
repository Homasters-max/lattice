// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md §4).
// The checks of landing run through `land` itself, as a dry run on a
// `git-fixture` of the fixture's branches; the checks with no glue around them
// — a JSON text, a proposal value, apply, the lines of a store — run alone.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileOf } from "../../src/adapters/store-jsonl/index.js";
import { checkFormat, KR_04, KR_06, KR_10, KR_11, KR_13, parseJson, parseJsonBytes, refused, type Format, type JsonValue } from "../../src/kernel/index.js";
import { apply, createView, encodeCommit, land, LG_06, LG_09, LG_23, LG_54, openLines, readProposal, type LandActs } from "../../src/ledger/index.js";
import { landingPortsForTests, type GitFixtureOptions } from "../support/assembly.js";
import type { CheckOutcome, FixtureCheck } from "./run.js";

/** The land session of every fixture: apply takes the commit's `by` and `at` from it (LG-22). */
const LAND: LandActs = { session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:00:00.000000Z" }, events: [] };

const field = (input: unknown, name: string): unknown => (input as { readonly [k: string]: unknown })[name];

/** `input`: `{ text }`, or `{ bytes }` — the numbers of the bytes — for input that is not UTF-8. */
const json: FixtureCheck = {
  enforces: [KR_10.id],
  run: (input) => {
    const bytes = field(input, "bytes");
    return Array.isArray(bytes) ? parseJsonBytes(Uint8Array.from(bytes as number[])) : parseJson(String(field(input, "text")));
  },
};

/** `input`: `{ format, value }` — a format of KR-11 and a JSON value, checked from the root. */
const format: FixtureCheck = {
  enforces: [KR_11.id],
  run: (input) => refused(checkFormat(field(input, "format") as Format, field(input, "value") as JsonValue, { intent: null, path: "" })) ?? { ok: true },
};

/** `input`: `{ proposal }`, read as a proposal value, refused from its root. */
const proposal: FixtureCheck = {
  enforces: [LG_09.id],
  run: (input) => readProposal(field(input, "proposal") as JsonValue),
};

/** A proposal applied on an empty ledger. */
function applied(value: JsonValue) {
  const read = readProposal(value);
  return read.ok ? apply(createView(0, []), read.value, LAND, []) : read;
}

/** `input`: `{ proposal }`, applied on an empty ledger: phase 1 checks ids, canon and the body limit. */
const applyCheck: FixtureCheck = {
  enforces: [KR_06.id, KR_10.id, KR_13.id],
  run: (input) => applied(field(input, "proposal") as JsonValue),
};

/** The line of the commit apply forms for a proposal on an empty ledger. */
function lineOf(value: JsonValue): string {
  const commit = applied(value);
  if (!commit.ok || commit.value === "no-op") throw new Error("bug: the pass proposal of a store fixture applies to a commit");
  return encodeCommit(commit.value);
}

/** Bytes given in a fixture: a string, as UTF-8, or the numbers of the bytes, for bytes that are not UTF-8. */
const bytesOf = (v: unknown): Uint8Array => (Array.isArray(v) ? Uint8Array.from(v as number[]) : new TextEncoder().encode(String(v)));

/**
 * `input`: `{ lines }` — the raw lines of `store/knowledge.jsonl`, each a string or the numbers of its bytes, as a
 * broken file can hold them; a trigger needs lines apply never forms (Q-23) — or `{ proposal }`, whose line apply
 * forms.
 */
const store: FixtureCheck = {
  enforces: [KR_10.id, LG_06.id, KR_04.id],
  run: (input) => {
    const raw = field(input, "lines");
    return openLines(raw === undefined ? [new TextEncoder().encode(lineOf(field(input, "proposal") as JsonValue))] : (raw as unknown[]).map(bytesOf));
  },
};

type FixtureFile = string | Uint8Array | null;

/**
 * A file of a branch in a fixture: a string, its text; `null`, removed; `{ json }`, the JSON text of a value;
 * `{ landed }`, the `store/knowledge.jsonl` landing writes for one proposal on an empty store — the line apply forms,
 * framed by `fileOf` of `store-jsonl`; `{ bytes }`, the numbers of bytes that are not UTF-8. A raw store or tree that
 * no landing writes is the input of a trigger only (Q-23).
 */
function fileOfFixture(v: unknown): FixtureFile {
  if (v === null || typeof v === "string") return v;
  if (field(v, "landed") !== undefined) return fileOf(lineOf(field(v, "landed") as JsonValue));
  if (field(v, "bytes") !== undefined) return bytesOf(field(v, "bytes"));
  return JSON.stringify(field(v, "json"));
}

/** The branches of a fixture, in the order it gives them, as `git-fixture` takes them. */
function branchesOf(v: unknown): GitFixtureOptions["branches"] {
  const branches = v as { readonly [name: string]: { readonly from?: string; readonly files: { readonly [path: string]: unknown } } };
  return Object.fromEntries(
    Object.entries(branches).map(([name, b]) => [name, { ...b, files: Object.fromEntries(Object.entries(b.files).map(([path, f]) => [path, fileOfFixture(f)])) }]),
  );
}

/** The outcome of a dry run as a hard check: refused with its rejections, or accepted where it would land. */
async function dryRun(dir: string, input: unknown): Promise<CheckOutcome> {
  const request = String(field(input, "request"));
  const out = await land(landingPortsForTests({ dir, branches: branchesOf(field(input, "branches")) }), request, { dryRun: true });
  if (out.outcome === "rejections") return { ok: false, rejections: out.rejections };
  if (out.outcome === "commit" || out.outcome === "no-op") return { ok: true };
  throw new Error(`bug: a fixture of landing ends commit, no-op or rejections; ${request} ended ${out.outcome}`);
}

/**
 * `input`: `{ branches, request }` — the branches of a `git-fixture`, `main` among them, each `{ from?, files }` with
 * files as `fileOfFixture` reads them — and the change request a dry run of landing checks (LG-26). Every path is
 * from the root of the tree of the change request (Q-29).
 */
const landCheck: FixtureCheck = {
  enforces: [LG_54.id, LG_23.id, KR_10.id, LG_09.id],
  run: async (input) => {
    const dir = mkdtempSync(join(tmpdir(), "lattice-fixture-"));
    try {
      return await dryRun(dir, input);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

export const CHECKS: { readonly [check: string]: FixtureCheck } = {
  json,
  format,
  proposal,
  apply: applyCheck,
  store,
  land: landCheck,
};
