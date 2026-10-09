// A chain of `knowledge` commits as landing forms it from S0-20: each proposal
// applied on the store of the commits before it (LG-14), chained to the tail
// (LG-05, G-14) and signed by the key of the land session (LG-06). Everything
// goes through public functions of the ledger; no commit is built by hand.
import { isJsonObject, ROOT, type JsonValue } from "../../src/kernel/index.js";
import { apply, chainTo, commitLine, openLines, readProposal, signCommit, type Commit, type KeyOfSession, type LandActs } from "../../src/ledger/index.js";
import { signSession, type UnsignedSession } from "../../src/trust/index.js";
import { testKey, type TestKey } from "./keys.js";

/** The land session of a chain: apply takes the commit's `by` and `at` from it (LG-22); its key is the test key `land`. */
export const LAND: LandActs = { session: { id: "01JB2X00000000000000000LND", at: "2026-10-06T12:00:00.000000Z" }, events: [] };

export const LAND_KEY = testKey("land");

/** The keys of sessions a chain knows: the land session's. */
export const keyOfLand: KeyOfSession = (session) => (session === LAND.session.id ? LAND_KEY.publicKey : null);

/** Who lands a chain: the land session and the key that signs its commits. */
type Lander = { readonly acts: LandActs; readonly key: TestKey };

/** One more commit: the proposal applied on the store of `commits`, chained to its tail and signed. */
function next(commits: readonly Commit[], value: JsonValue, { acts, key }: Lander): Commit {
  const keyOf: KeyOfSession = (session) => (session === acts.session.id ? key.publicKey : null);
  const opened = openLines(commits.map(commitLine), keyOf);
  if (!opened.ok) throw new Error("bug: the commits of a chain open as a store");
  const read = readProposal(value);
  const out = read.ok ? apply(opened.value.view, read.value, acts, []) : read;
  if (!out.ok || out.value === "no-op") throw new Error("bug: each proposal of a chain applies to a commit");
  return signCommit(chainTo(out.value, opened.value.tail), key.key);
}

const chainOf = (proposals: readonly JsonValue[], lander: Lander): Commit[] => proposals.reduce<Commit[]>((commits, p) => [...commits, next(commits, p, lander)], []);

/** The commits landing writes for these proposals, from genesis. */
export const landedChain = (proposals: readonly JsonValue[]): Commit[] => chainOf(proposals, { acts: LAND, key: LAND_KEY });

/** A land session whose `id` is a ULID (KR-06), so that its event can be written as a record. */
const RECORDING: Lander = { acts: { session: { id: "01JB2X0000000000000000RECD", at: LAND.session.at }, events: [] }, key: LAND_KEY };

/** The participant key that signs the certificate of the land session (TR-11). */
const LAND_MACHINE = testKey("land-machine");

/** What a trigger changes in the event of the land session: its type, the key its certificate holds, or its whole body. */
export type SessionChange = { readonly type?: string; readonly key?: string; readonly body?: JsonValue };

/**
 * The event of the land session of `recordedChain` as an intent: its certificate holds the key that signs the commits,
 * signed by the land machine (TR-11, G-48) — or what `change` makes of it.
 */
export function landSessionIntent(change: SessionChange = {}): JsonValue {
  const { acts, key } = RECORDING;
  const unsigned: UnsignedSession = {
    id: acts.session.id,
    at: acts.session.at,
    body: {
      participant: "land",
      kind: "machine",
      role: "land",
      purpose: "work",
      software: "lattice",
      version: "0",
      certificate: { key: change.key ?? key.publicKey, expires: "2026-10-07T12:00:00.000000Z" },
    },
  };
  const signed = signSession(unsigned, LAND_MACHINE.key, ROOT);
  if (!signed.ok) throw new Error("bug: the land session of the tests signs");
  const { id, at, body } = signed.value;
  return { op: "event", id, type: change.type ?? "core/session@1", expected: null, at, body: change.body === undefined ? body : change.body };
}

/** A proposal with these intents first. */
export function withIntents(proposal: JsonValue, ...intents: JsonValue[]): JsonValue {
  if (!isJsonObject(proposal) || !Array.isArray(proposal.intents)) throw new Error("bug: a proposal of a chain has intents");
  return { ...proposal, intents: [...intents, ...(proposal.intents as readonly JsonValue[])] };
}

/**
 * A chain whose first commit records the event of its land session, as landing writes it into the commit it lands from
 * S0-20 (LG-22): a store of it opens by the keys it records (`RECORDED`, TR-11). A trigger changes that event by `change`.
 */
export function recordedChain(proposals: readonly JsonValue[], change: SessionChange = {}): Commit[] {
  const [first, ...rest] = proposals;
  return chainOf(first === undefined ? [] : [withIntents(first, landSessionIntent(change)), ...rest], RECORDING);
}
