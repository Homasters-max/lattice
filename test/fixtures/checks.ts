// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md).
import type { JsonValue } from "../../src/kernel/index.js";
import { KR_06 } from "../../src/kernel/rules.js";
import { apply, createView, readProposal, type LandActs } from "../../src/ledger/index.js";
import type { FixtureCheck } from "./run.js";

/** The land session of every fixture: apply takes the commit's `by` and `at` from it (LG-22). */
const LAND: LandActs = { session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:00:00.000000Z" }, events: [] };

/** `input`: `{ proposal }`, applied on an empty ledger. */
const applyCheck: FixtureCheck = {
  enforces: [KR_06.id],
  run: (input) => apply(createView(0, []), readProposal((input as { proposal: JsonValue }).proposal), LAND, []),
};

export const CHECKS: Readonly<Record<string, FixtureCheck>> = { apply: applyCheck };
