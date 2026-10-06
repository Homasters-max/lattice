// A `knowledge` commit (LG-06) and the evidence it cites (LG-30). The store
// keeps a commit as its canonical line (KR-10): the ledger encodes and decodes
// it, the adapter never parses it. A line is read as a commit on the surface —
// the header fields, their JSON kinds and the header of each record (KR-04);
// the chain and its signatures are verified when a store opens from S0-10 and
// S0-11 (LG-05).
import { canon, checkHeader, decodeUtf8, gotOf, hash, isJsonObject, parseJson, reject, refused, type JsonValue, type Record, type Rejection, type Result } from "../kernel/index.js";
import { LG_06 } from "./rules.js";

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
export function readCommit(value: JsonValue, path: string): Result<Commit> {
  // Every field was checked against its kind above, so the value has the shape of Commit.
  return refused<Commit>(commitRejections(value, path)) ?? { ok: true, value: value as Commit };
}

/**
 * The commit of the `index`-th line of a store — its bytes, as the store keeps them — refused at `/<index>`:
 * KR-10 for bytes that are not UTF-8 or a text that is not JSON (an empty line too), LG-06 and KR-04 for its form.
 */
export function decodeCommit(line: Uint8Array, index: number): Result<Commit> {
  const text = decodeUtf8(line, `/${index}`);
  const parsed = text.ok ? parseJson(text.value, `/${index}`) : text;
  return parsed.ok ? readCommit(parsed.value, `/${index}`) : parsed;
}
