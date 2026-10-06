// The `acts` port (TR-14, TR-16): an act reaches LATTICE only through it.
// Adapters: `local`, `init`, `fixture`, `recorded`. The exact types arrive
// with S0-19.

/** An act as its source shows it; landing writes each as an `act` event (TR-16). */
export type Act = {
  readonly verb: "approve" | "answer" | "acknowledge";
  /** The hash of the proposal it confirms (TR-15). */
  readonly target: string;
  /** Who acted, as the source names them. */
  readonly identity: string;
  /** Where the act lives. */
  readonly uri: string;
  /** The source time, a `date-time` of KR-11. */
  readonly at: string;
  /** The result of the check of its signature. */
  readonly verified: boolean;
};

export interface Acts {
  /** The acts on a change request. */
  read(request: string): Promise<readonly Act[]>;
}
