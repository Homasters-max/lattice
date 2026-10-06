// A `knowledge` commit (LG-06) and the evidence it cites (LG-30). The store
// keeps a commit as its canonical line (KR-10): the ledger encodes and decodes
// it, the adapter never parses it. The chain, its signatures and the form of
// a stored commit are verified when a store opens — S0-10, S0-11.
import { canon, hash, parseJson, type Record, type Result } from "../kernel/index.js";

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

/** The line a store keeps for a commit: its canonical JSON. */
export const encodeCommit = (c: Commit): string => canon(c);

/** The commit of the `index`-th line of a store; a line that is not JSON is refused with KR-10 at `/<index>`. */
export function decodeCommit(line: string, index: number): Result<Commit> {
  const parsed = parseJson(line, `/${index}`);
  // The ledger wrote the line from a Commit; its form is verified on opening from S0-11 (LG-05).
  return parsed.ok ? { ok: true, value: parsed.value as Commit } : parsed;
}
