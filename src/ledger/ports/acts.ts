// The `acts` port (TR-14, TR-16): an act reaches LATTICE only through it.
// Adapters: `local` (a signed git commit or tag), `init` (store init, LG-47),
// `fixture` (tests) and `recorded` (the acts a commit holds as `act` events).
// Landing reads the acts of a change request once and writes each as an `act`
// event with the result of its check (TR-16); what reads them again —
// re-landing, opening a store, fold — reads those events through `recorded`
// and never calls the source. `actsOf` reads them out of a commit. An act is
// the body of its event, whose rules are those of trust (TR-15, TR-16).
import type { Act } from "../../trust/index.js";
import type { Commit } from "../commit.js";

export type { Act, Commit };

/** The type of the event landing writes for each act it read (TR-16, TY-Z05). */
export const ACT_TYPE = "std/act@1";

export interface Acts {
  /** The acts on a change request; one without acts has none. */
  read(request: string): Promise<readonly Act[]>;
}

/**
 * TR-16, LG-22: the acts a commit holds — the bodies of its `act` events, those `by` its land session, in the order
 * of its records; an event of the same type a proposal carried is no act landing read. Each is a body an adapter
 * gave landing and phase 1 of apply found canonical (LG-16), so it is read back as it was written.
 */
export function actsOf(commit: Commit): readonly Act[] {
  return commit.records.filter((r) => r.type === ACT_TYPE && r.by === commit.by).map((r) => r.body as Act);
}
