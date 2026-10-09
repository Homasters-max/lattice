// Acts in the ledger (TR-14…TR-16): landing reads the acts of a change request
// once, through the port `acts`, and forms each as an `act` event of the commit
// it lands (LG-22) — `by` the land session, `at` the time of landing, the act
// itself the body. Whether an act counts for a proposal is read from that body
// — the result of the check made at the source, never a second check (TR-16) —
// so an act read back through `recorded` counts as it did when it landed.
// Whose act counts, and where one is needed, is phase 5 (TR-15, TR-42, S0-17).
import { refused, reject, type Place, type Rejection, type Result } from "../kernel/index.js";
import type { Act } from "./ports/acts.js";
import { TR_15, TR_16 } from "./rules.js";

/** LG-22: an act formed as an event of the commit landing lands — its `id` from the port `ids`, its `at` the time of landing. */
export type ActEvent = { readonly id: string; readonly at: string; readonly body: Act };

const under = (place: Place, name: string): Place => ({ intent: place.intent, path: `${place.path}/${name}` });

/**
 * TR-15, TR-16: the act, where it covers the whole proposal of this hash — an `approve` that names the hash, whose
 * check passed at its source — or the reasons it does not, at the place the caller names, where the act sits.
 */
export function coversProposal(act: Act, proposal: string, place: Place): Result<Act> {
  const found: Rejection[] = [];
  if (!act.verified) found.push(reject(TR_16, { ...under(place, "verified"), expected: true, got: act.verified }));
  if (act.verb !== "approve") found.push(reject(TR_15, { ...under(place, "verb"), expected: "approve", got: act.verb }));
  if (act.target !== proposal) found.push(reject(TR_15, { ...under(place, "target"), expected: proposal, got: act.target }));
  return refused<Act>(found) ?? { ok: true, value: act };
}
