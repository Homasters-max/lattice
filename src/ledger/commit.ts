// A `knowledge` commit (LG-06) and the evidence it cites (LG-30). The chain,
// canonical order of records and signatures arrive with S0-10.
import { hash, type Record } from "../kernel/index.js";

export type Commit = {
  readonly seq: number;
  readonly prev: string | null;
  readonly kernel: string;
  readonly base: number;
  readonly proposal: string;
  readonly proposal_sig: string | null;
  readonly by: string;
  readonly at: string;
  readonly request: string | null;
  readonly sig: string | null;
  readonly records: readonly Record[];
};

/** An evidence file a commit cites: opaque bytes in S0. */
export type Evidence = {
  readonly hash: string;
  readonly bytes: Uint8Array;
};

/** LG-06: the hash of a commit, computed without `sig`. */
export function commitHash(c: Commit): string {
  const { seq, prev, kernel, base, proposal, proposal_sig, by, at, request, records } = c;
  return hash({ seq, prev, kernel, base, proposal, proposal_sig, by, at, request, records });
}
