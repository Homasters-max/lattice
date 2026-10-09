// Acts (TR-14…TR-16): an act reaches LATTICE through the port `acts` of the
// ledger, and landing writes each as the body of an `act` event of type
// `std/act@1` (LG-22). Whether an act counts for a proposal is a rule of trust
// over that body — the result of the check made at the source, never a second
// check (TR-16) — so an act read back through `recorded` counts as it did
// when it landed. Whose act counts, and where one is needed, is phase 5
// (TR-15, TR-42, S0-17).
import { refused, reject, type Place, type Rejection, type Result } from "../kernel/index.js";
import { TR_15, TR_16 } from "./rules.js";

/** An act as its source shows it: the body of the `act` event landing writes for it (TR-16). */
export type Act = {
  readonly verb: "approve" | "answer" | "acknowledge";
  /**
   * What it confirms (TR-15) — the hash of a proposal, or intents by `id` and body hash — or what it answers or
   * acknowledges, as the source names it: the port reads no meaning into it.
   */
  readonly target: string;
  /** Who acted, as the source names them: `ssh:<key fingerprint>` for a `local` act (TR-09). */
  readonly identity: string;
  /** Where the act lives, an absolute URI (KR-24). */
  readonly uri: string;
  /** The source time, a `date-time` of KR-11. */
  readonly at: string;
  /** The result of the check of the act at its source — for `local`, of its signature (TR-16). */
  readonly verified: boolean;
  /** The text of an answer (TR-14). */
  readonly text?: string;
};

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
