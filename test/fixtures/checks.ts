// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md).
import { decodeUtf8, KR_06, KR_10, parseJson, type JsonValue } from "../../src/kernel/index.js";
import { apply, createView, LG_09, LG_54, proposalPath, readProposal, type LandActs } from "../../src/ledger/index.js";
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

/** `input`: `{ files }` — the paths under `store/proposals/` of a change request. */
const changeRequest: FixtureCheck = {
  enforces: [LG_54.id],
  run: (input) => proposalPath(field(input, "files") as string[]),
};

/** `input`: `{ proposal }`, applied on an empty ledger. */
const applyCheck: FixtureCheck = {
  enforces: [KR_06.id],
  run: (input) => {
    const read = readProposal(field(input, "proposal") as JsonValue);
    return read.ok ? apply(createView(0, []), read.value, LAND, []) : read;
  },
};

export const CHECKS: { readonly [check: string]: FixtureCheck } = { json, proposal, "change-request": changeRequest, apply: applyCheck };
