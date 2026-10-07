// A `knowledge` commit (LG-06) and the evidence it cites (LG-30). The store
// keeps a commit as its canonical line (KR-10): the ledger encodes and decodes
// it, the adapter never parses it, and a line that is not those bytes is
// refused. A line is read as a commit on the surface — the header fields,
// their JSON kinds and the header of each record (KR-04). A commit is chained
// to its predecessor and signed by its land session; `verifyChain` checks the
// chain and the signatures, which opening a store runs from S0-11 (LG-05).
import { canon, checkHeader, compareText, gotOf, hash, hashBytes, isJsonObject, KR_10, parseJsonBytes, refuse, refused, reject, type JsonValue, type Record, type Rejection, type Result } from "../kernel/index.js";
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

/** LG-06: the hash of a commit, computed without `sig`. */
export function commitHash(c: Commit): string {
  const { seq, prev, kernel, base, proposal, proposal_sig, by, at, request, records } = c;
  return known(hash({ seq, prev, kernel, base, proposal, proposal_sig, by, at, request, records }), "a commit");
}

/** G-14: apply knows neither the tail nor the change request; landing chains the commit to the tail (LG-05). */
export const chainTo = (candidate: Commit, tail: Commit | null): Commit => ({ ...candidate, prev: tail === null ? null : commitHash(tail) });

/** LG-06: the commit signed by the key of its land session: `sig` is the signature of its hash. */
export const signCommit = (c: Commit, landKey: SessionKey): Commit => ({ ...c, sig: signHash(commitHash(c), landKey) });

/** The public key of a session by its `id` (TR-11), or `null` for a session the caller knows no key of. */
export type KeyOfSession = (session: string) => PublicKey | null;

/** LG-06: `sig` is the signature of the commit's hash by the key of its land session, `by`. */
function signatureRejections(c: Commit, keyOfSession: KeyOfSession, path: string): Rejection[] {
  const key = keyOfSession(c.by);
  const signed = commitHash(c);
  if (key !== null && c.sig !== null && verifyHash(signed, c.sig, key)) return [];
  return [reject(LG_06, { intent: null, path: `${path}/sig`, expected: { hash: signed, key }, got: c.sig })];
}

/** LG-04, LG-05, LG-06: a commit against its place in the chain and its predecessor. */
function linkRejections(c: Commit, n: number, before: Commit | null, path: string): Rejection[] {
  const prev = before === null ? null : commitHash(before);
  return [
    ...(c.seq === n ? [] : [reject(LG_04, { intent: null, path: `${path}/seq`, expected: n, got: c.seq })]),
    ...(c.prev === prev ? [] : [reject(LG_05, { intent: null, path: `${path}/prev`, expected: prev, got: c.prev })]),
    ...(before === null || compareText(c.at, before.at) >= 0 ? [] : [reject(LG_06, { intent: null, path: `${path}/at`, expected: `not before ${before.at}`, got: c.at })]),
  ];
}

/**
 * LG-04, LG-05, LG-06: the rejections of a chain of `knowledge` commits from genesis — `seq` dense from 1, `prev`
 * the hash of the previous commit, `at` never decreasing (KR-11 spells it so that text order is time order) and
 * `sig` the signature of each commit by the key of its land session. The commits are the lines of a store at
 * `path`, each at its number from 1, as `seq` counts (Q-29).
 */
export function verifyChain(commits: readonly Commit[], keyOfSession: KeyOfSession, path: string): Rejection[] {
  return commits.flatMap((c, i) => {
    const line = `${path}/${i + 1}`;
    return [...linkRejections(c, i + 1, commits[i - 1] ?? null, line), ...signatureRejections(c, keyOfSession, line)];
  });
}

/** The line a store keeps for a commit: its canonical JSON. */
export const encodeCommit = (c: Commit): string => known(canon(c), "a commit");

type Field = { readonly expected: string; readonly fits: (v: JsonValue | undefined) => boolean };

const STRING: Field = { expected: "a string", fits: (v) => typeof v === "string" };
const NUMBER: Field = { expected: "a number", fits: (v) => typeof v === "number" };
const STRING_OR_NULL: Field = { expected: "a string or null", fits: (v) => v === null || typeof v === "string" };

const COMMIT: { readonly [field in keyof Commit]: Field } = {
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
  records: { expected: "a list of records", fits: (v) => Array.isArray(v) },
};

function commitRejections(value: JsonValue, path: string): Rejection[] {
  if (!isJsonObject(value)) return [reject(LG_06, { intent: null, path, expected: "a commit", got: gotOf(value) })];
  const header = Object.entries(COMMIT).flatMap(([name, field]) =>
    field.fits(value[name]) ? [] : [reject(LG_06, { intent: null, path: `${path}/${name}`, expected: field.expected, got: gotOf(value[name]) })],
  );
  const records = Array.isArray(value.records) ? (value.records as readonly JsonValue[]) : [];
  return [...header, ...records.flatMap((r, i) => checkHeader(r, `${path}/records/${i}`))];
}

/** LG-06, KR-04: the commit a JSON value holds, refused at `path` — where it sits in its input — when it has not the form of one. */
function readCommit(value: JsonValue, path: string): Result<Commit> {
  // Every field was checked against its kind above, so the value has the shape of Commit.
  return refused<Commit>(commitRejections(value, path)) ?? { ok: true, value: value as Commit };
}

/** KR-10: the line of a commit is its canonical bytes; any other bytes of the same commit are refused, never repaired. */
function canonical(line: Uint8Array, commit: Commit, path: string): Result<Commit> {
  const [expected, got] = [hashBytes(new TextEncoder().encode(encodeCommit(commit))), hashBytes(line)];
  return expected === got ? { ok: true, value: commit } : refuse(reject(KR_10, { intent: null, path, expected, got }));
}

/**
 * The commit of a line of a store — its bytes, as the store keeps them — refused at `path`, where the line sits
 * in its input: KR-10 for bytes that are not UTF-8, a text that is not JSON (an empty line too) and a line that is
 * not the canonical bytes of its commit (a byte order mark, a carriage return, spaces), LG-06 and KR-04 for its form.
 */
export function decodeCommit(line: Uint8Array, path: string): Result<Commit> {
  const parsed = parseJsonBytes(line, path);
  const commit = parsed.ok ? readCommit(parsed.value, path) : parsed;
  return commit.ok ? canonical(line, commit.value, path) : commit;
}
