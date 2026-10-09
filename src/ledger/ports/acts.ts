// The `acts` port (TR-14, TR-16): an act reaches LATTICE only through it.
// Adapters: `local` (a signed git commit or tag), `init` (store init, LG-47),
// `fixture` (tests) and `recorded` (the acts a commit holds as `act` events).
// Landing reads the acts of a change request once and writes each as an `act`
// event with the result of its check (TR-16); what reads them again —
// re-landing, opening a store, fold — reads those events through `recorded`
// and never calls the source. `actsOf` reads them out of a commit.
import type { Commit } from "../commit.js";

export type { Commit };

/** The type of the event landing writes for each act it read (TR-16, TY-Z05). */
export const ACT_TYPE = "std/act@1";

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

export interface Acts {
  /** The acts on a change request; one without acts has none. */
  read(request: string): Promise<readonly Act[]>;
}

/**
 * TR-16: the acts a commit holds — the bodies of its `act` events, in the order of its records. Each is a body an
 * adapter gave landing and phase 1 of apply found canonical (LG-16), so it is read back as it was written.
 */
export function actsOf(commit: Commit): readonly Act[] {
  return commit.records.filter((r) => r.type === ACT_TYPE).map((r) => r.body as Act);
}
