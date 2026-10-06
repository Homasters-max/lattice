// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md).
import { decodeUtf8, KR_04, KR_06, KR_10, parseJson, type JsonValue } from "../../src/kernel/index.js";
import {
  apply,
  changeRequest,
  createView,
  encodeCommit,
  keptKnowledge,
  LG_06,
  LG_09,
  LG_23,
  LG_54,
  openLines,
  proposalPath,
  readProposal,
  type LandActs,
} from "../../src/ledger/index.js";
import type { FixtureCheck } from "./run.js";

/** The land session of every fixture: apply takes the commit's `by` and `at` from it (LG-22). */
const LAND: LandActs = { session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:00:00.000000Z" }, events: [] };

const field = (input: unknown, name: string): unknown => (input as { readonly [k: string]: unknown })[name];

/** `input`: `{ text }`, or `{ bytes }` — the numbers of the bytes — for input that is not UTF-8. */
const json: FixtureCheck = {
  enforces: [KR_10.id],
  run: (input) => {
    const bytes = field(input, "bytes");
    const text = Array.isArray(bytes) ? decodeUtf8(Uint8Array.from(bytes as number[])) : { ok: true as const, value: String(field(input, "text")) };
    return text.ok ? parseJson(text.value) : text;
  },
};

/** `input`: `{ proposal }`, read as the proposal file of a change request. */
const proposal: FixtureCheck = {
  enforces: [LG_09.id],
  run: (input) => readProposal(field(input, "proposal") as JsonValue),
};

/** `input`: `{ files }` — the paths under `store/proposals/` of a change request — or `{ head: null }` for one that does not exist. */
const changeRequestCheck: FixtureCheck = {
  enforces: [LG_54.id],
  run: (input) => (field(input, "files") === undefined ? changeRequest(field(input, "head") as string | null) : proposalPath(field(input, "files") as string[])),
};

/** `input`: `{ proposal }`, applied on an empty ledger. */
const applyCheck: FixtureCheck = {
  enforces: [KR_06.id],
  run: (input) => {
    const read = readProposal(field(input, "proposal") as JsonValue);
    return read.ok ? apply(createView(0, []), read.value, LAND, []) : read;
  },
};

/** The line of the commit apply forms for a proposal on an empty ledger. */
function lineOf(value: JsonValue): Uint8Array {
  const read = readProposal(value);
  const applied = read.ok ? apply(createView(0, []), read.value, LAND, []) : read;
  if (!applied.ok || applied.value === "no-op") throw new Error("bug: the pass proposal of a store fixture applies to a commit");
  return new TextEncoder().encode(encodeCommit(applied.value));
}

/** Bytes given in a fixture: a string, as UTF-8, or the numbers of the bytes, for bytes that are not UTF-8. */
const bytesOf = (v: unknown): Uint8Array => (Array.isArray(v) ? Uint8Array.from(v as number[]) : new TextEncoder().encode(String(v)));

/**
 * `input`: `{ lines }` — the raw lines of `store/knowledge.jsonl`, each a string or the numbers of its bytes, as a
 * change request or a broken file can hold them; a trigger needs lines apply never forms — or `{ proposal }`,
 * whose line apply forms.
 */
const store: FixtureCheck = {
  enforces: [KR_10.id, LG_06.id, KR_04.id],
  run: (input) => {
    const raw = field(input, "lines");
    return openLines(raw === undefined ? [lineOf(field(input, "proposal") as JsonValue)] : (raw as unknown[]).map(bytesOf));
  },
};

/** `input`: `{ tail, request }` — the bytes of `store/knowledge.jsonl` at the tail of main and in the change request, `null` where there is no file. */
const knowledge: FixtureCheck = {
  enforces: [LG_23.id],
  run: (input) => {
    const file = (name: string) => (field(input, name) === null ? null : bytesOf(field(input, name)));
    return keptKnowledge(file("tail"), file("request"));
  },
};

export const CHECKS: { readonly [check: string]: FixtureCheck } = {
  json,
  proposal,
  "change-request": changeRequestCheck,
  apply: applyCheck,
  store,
  knowledge,
};
