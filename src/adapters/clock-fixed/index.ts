// `clock-fixed` (ST-07): the deterministic clock for tests — always the time
// it was given.
import type { Clock } from "../../ledger/ports/clock.js";

export type ClockFixedOptions = { readonly at: string };

export function createClockFixed({ at }: ClockFixedOptions): Clock {
  return { now: () => at };
}
