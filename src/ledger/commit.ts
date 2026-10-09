// A `knowledge` commit (LG-06) and the evidence it cites (LG-30). The store
// keeps a commit as its line — its canonical bytes (KR-10) and a line feed
// (G-17): the ledger encodes and decodes it, the adapter never parses it, and
// bytes that are not those are refused. A commit is read on the surface — the
// header fields and no other (Q-31), their JSON kinds and the header of each
// record (KR-04); the hash covers every field but `sig`. A commit is chained to
// its predecessor and signed by its land session; `verifyChain` checks the
// chain and the signatures. Opening a store runs both (chain.ts, LG-05).
import {
  canon,
  checkHeader,
  closedForm,
  compareText,
  gotOf,
  hash,
  isJsonObject,
  NUMBER,
  refuse,
  refused,
  reject,
  rejectionsOf,
  STRING,
  STRING_OR_NULL,
  type JsonObject,
  type JsonValue,
  type Members,
  type MembersOf,
  type Place,
  type Record,
  type Rejection,
  type Result,
} from "../kernel/index.js";
import { signHash, verifyHash, type PublicKey, type SessionKey } from "../trust/index.js";
import { LG_04, LG_05, LG_06 } from "./rules.js";

/**
 * KR-10: the canonical text or hash of what the ledger knows canonical — a commit apply formed from a proposal phase 1
 * found canonical, a commit read from its canonical line, a proposal the strict parse read. A refusal here is a bug.
 */
export function known(result: Result<string>, what: string): string {
  if (result.ok) return result.value;
  const [first] = result.rejections;
  throw new Error(`bug: ${what} is not canonical: ${first.rule} at ${first.path}`);
}

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

/**
 * LG-06, LG-10: what the hash of a signed closed form covers — every member of its table but `sig`, which signs that
 * hash. A new member of the form is hashed without a second list.
 */
export function unsigned(value: JsonObject, members: Members): JsonObject {
  return Object.fromEntries(Object.keys(members).flatMap((name) => (name === "sig" || value[name] === undefined ? [] : [[name, value[name]] as const])));
}

/** LG-06: the hash of a commit, computed without `sig`. */
export function commitHash(c: Commit): string {
  return known(hash(unsigned(c, COMMIT)), "a commit");
}

/** G-14: apply knows neither the tail nor the change request; landing chains the commit to the tail (LG-05). */
export const chainTo = (candidate: Commit, tail: Commit | null): Commit => ({ ...candidate, prev: tail === null ? null : commitHash(tail) });

/** LG-06: the commit signed by the key of its land session: `sig` is the signature of its hash. */
export const signCommit = (c: Commit, landKey: SessionKey): Commit => ({ ...c, sig: signHash(commitHash(c), landKey) });

/** The public key of a session by its `id` (TR-11), or `null` for a session the caller knows no key of. */
export type KeyOfSession = (session: string) => PublicKey | null;

/** The place of a member or an item under the place of what holds it. */
const under = (place: Place, name: string | number): Place => ({ intent: place.intent, path: `${place.path}/${name}` });

/** LG-06: `sig` is the signature of the commit's hash by the key of its land session, `by`; none checked without keys (Q-39). */
function signatureRejections(c: Commit, keyOfSession: KeyOfSession | null, place: Place): readonly Rejection[] {
  if (keyOfSession === null) return [];
  const key = keyOfSession(c.by);
  const signed = commitHash(c);
  if (key !== null && c.sig !== null && verifyHash(signed, c.sig, key)) return [];
  return [reject(LG_06, { ...under(place, "sig"), expected: { hash: signed, key }, got: c.sig })];
}

/** LG-04, LG-05, LG-06: a commit against its place in the chain and its predecessor. */
function linkRejections(c: Commit, n: number, before: Commit | null, place: Place): Rejection[] {
  const prev = before === null ? null : commitHash(before);
  return [
    ...(c.seq === n ? [] : [reject(LG_04, { ...under(place, "seq"), expected: n, got: c.seq })]),
    ...(c.prev === prev ? [] : [reject(LG_05, { ...under(place, "prev"), expected: prev, got: c.prev })]),
    ...(before === null || compareText(c.at, before.at) >= 0 ? [] : [reject(LG_06, { ...under(place, "at"), expected: `not before ${before.at}`, got: c.at })]),
  ];
}

/**
 * LG-04, LG-05, LG-06: a chain of `knowledge` commits from genesis, verified, or its rejections — `seq` dense from
 * 1, `prev` the hash of the previous commit, `at` never decreasing (KR-11 spells it so that text order is time
 * order) and `sig` the signature of each commit by the key of its land session. The commits are the lines of a
 * store at the place the caller names, each at its number from 1, as `seq` counts (Q-29); the rejections come
 * sorted (CONVENTIONS.md §5.2). Without `keyOfSession` no signature is checked: only the stores landing opens, at the
 * tail of `main` and on the worktree of a change request, open so, until landing signs its commits (Q-39, S0-20).
 */
export function verifyChain(commits: readonly Commit[], keyOfSession: KeyOfSession | null, place: Place): Result<readonly Commit[]> {
  const found = commits.flatMap((c, i) => {
    const line = under(place, i + 1);
    return [...linkRejections(c, i + 1, commits[i - 1] ?? null, line), ...signatureRejections(c, keyOfSession, line)];
  });
  return refused<readonly Commit[]>(found) ?? { ok: true, value: commits };
}

/** G-17: the line a store keeps for a commit — its canonical JSON (KR-10) in UTF-8, and a line feed. */
export const commitLine = (c: Commit): Uint8Array => new TextEncoder().encode(`${known(canon(c), "a commit")}\n`);

/** What the closed form of a commit admits: its header, and its records as JSON values, each read by `checkHeader`. */
type Fields = Omit<Commit, "records"> & { readonly records: readonly JsonValue[] };

/** LG-06: the header of a commit and its records; no other field. */
const COMMIT: MembersOf<Fields> = {
  seq: NUMBER,
  prev: STRING_OR_NULL,
  kernel: STRING,
  base: NUMBER,
  proposal: STRING,
  proposal_sig: STRING_OR_NULL,
  by: STRING,
  at: STRING,
  request: STRING_OR_NULL,
  sig: STRING_OR_NULL,
  records: { expected: "a list of records", fits: (v): v is readonly JsonValue[] => Array.isArray(v) },
};

/**
 * LG-06, KR-04: the commit a JSON value holds — the value of a line of a store, which the kernel read as canonical
 * (KR-10, `parseCanonicalLine`) — or its rejections at the place the caller names, where it sits in its input: its
 * own fields, and the header of every record it holds, even when its own fields are broken.
 */
export function readCommit(value: JsonValue, place: Place): Result<Commit> {
  if (!isJsonObject(value)) return refuse(reject(LG_06, { ...place, expected: "a commit", got: gotOf(value) }));
  const fields = closedForm(value, COMMIT, LG_06, place);
  const listed = COMMIT.records.fits(value.records) ? value.records : [];
  const records = listed.map((r, i) => checkHeader(r, under(under(place, "records"), i)));
  const refusal = refused<Commit>([...rejectionsOf(fields), ...records.flatMap(rejectionsOf)]);
  if (refusal !== null) return refusal;
  return fields.ok ? { ok: true, value: { ...fields.value, records: records.flatMap((r) => (r.ok ? [r.value] : [])) } } : fields;
}
