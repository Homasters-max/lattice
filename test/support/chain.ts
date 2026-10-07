// A chain of `knowledge` commits as landing forms it from S0-20: each proposal
// applied on the store of the commits before it (LG-14), chained to the tail
// (LG-05, G-14) and signed by the key of the land session (LG-06). Everything
// goes through public functions of the ledger; no commit is built by hand.
import type { JsonValue } from "../../src/kernel/index.js";
import { apply, chainTo, encodeCommit, openLines, readProposal, signCommit, type Commit, type KeyOfSession, type LandActs } from "../../src/ledger/index.js";
import { testKey } from "./keys.js";

/** The land session of a chain: apply takes the commit's `by` and `at` from it (LG-22); its key is the test key `land`. */
export const LAND: LandActs = { session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:00:00.000000Z" }, events: [] };

export const LAND_KEY = testKey("land");

/** The keys of sessions a chain knows: the land session's. */
export const keyOfLand: KeyOfSession = (session) => (session === LAND.session.id ? LAND_KEY.publicKey : null);

const lineOf = (c: Commit) => new TextEncoder().encode(encodeCommit(c));

/** One more commit: the proposal applied on the store of `commits`, chained to its tail and signed. */
function next(commits: readonly Commit[], value: JsonValue): Commit {
  const opened = openLines(commits.map(lineOf));
  if (!opened.ok) throw new Error("bug: the commits of a chain open as a store");
  const read = readProposal(value);
  const out = read.ok ? apply(opened.value.view, read.value, LAND, []) : read;
  if (!out.ok || out.value === "no-op") throw new Error("bug: each proposal of a chain applies to a commit");
  return signCommit(chainTo(out.value, opened.value.tail), LAND_KEY.key);
}

/** The commits landing writes for these proposals, from genesis. */
export function landedChain(proposals: readonly JsonValue[]): Commit[] {
  return proposals.reduce<Commit[]>((commits, p) => [...commits, next(commits, p)], []);
}
