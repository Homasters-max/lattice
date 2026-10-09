// Acts in the ledger (TR-14…TR-16): landing reads the acts of a change request
// once, through the port `acts`, and forms each as an `act` event of the commit
// it lands (LG-22) — `by` the land session, `at` the time of landing, the act
// itself the body. Whether an act counts for a proposal is a rule of trust over
// that body (`coversProposal`, TR-15, TR-16), which phase 5 calls (S0-17).
import type { Act } from "./ports/acts.js";

/** LG-22: an act formed as an event of the commit landing lands — its `id` from the port `ids`, its `at` the time of landing. */
export type ActEvent = { readonly id: string; readonly at: string; readonly body: Act };
