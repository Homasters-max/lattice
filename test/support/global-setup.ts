// Once before any test (S0-41): the seed of the run is printed, so a failed
// run names the seed that replays it, and a bad LATTICE_SEED stops the run.
import { seedOf } from "./budget.js";

export function setup(): void {
  console.log(`LATTICE_SEED=${seedOf(process.env.LATTICE_SEED)} — set it to replay this run`);
}
