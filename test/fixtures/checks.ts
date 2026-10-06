// The table of hard checks the rule fixtures run against (ST-17): the name a
// fixture gives in `check` → the rule IDs the check enforces and a function
// that feeds it the fixture's `input`. A task that adds a hard check adds its
// row here; the input is built only through public functions (CONVENTIONS.md).
import type { FixtureCheck } from "./run.js";

export const CHECKS: Readonly<Record<string, FixtureCheck>> = {};
