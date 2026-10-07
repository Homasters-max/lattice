// Records (KR-04…KR-09). The header is exactly `{id, rev, type, hash, by, at,
// body}`. `rev` is present only for an entity, and whether a record is one is
// the `kind` of its type (KR-05), which the kernel does not hold: `checkRev`
// takes the kind from a caller that knows the type — phase 2 of apply (S0-13)
// — while `checkHeader`, which a store runs as it opens, before its types are
// folded, reads the kind the header claims from `rev`. `id` follows that kind
// (KR-06), `type` is a pinned reference read by the one reference parser
// (KR-07, PR-01), `by` is the ULID of the event that wrote the record (KR-08)
// and `at` a canonical date-time (KR-11) the kernel gives no meaning (KR-09).
// Whether `hash` is the hash of the record (KR-12) is not a matter of its form.
import { closedRejections, JSON_VALUE, STRING, type Member } from "./closed-form.js";
import { checkFormat, isUlid } from "./formats.js";
import { checkId, type Kind } from "./id.js";
import { gotOf, isJsonObject, type JsonObject, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { reject, type Place, type Rejection } from "./rejection.js";
import { KR_04, KR_07, KR_08 } from "./rules.js";

/** KR-04: the one header of every record; `rev` only for an entity. */
export type Record = {
  readonly id: string;
  readonly rev?: number;
  readonly type: string;
  readonly hash: string;
  readonly by: string;
  readonly at: string;
  readonly body: JsonValue;
};

/** A revision: an integer from 1 (G-12), safe as every JSON integer (G-20). */
const isRevision = (v: JsonValue | undefined): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

const HEADER: { readonly [field in keyof Record]-?: Member } = {
  id: STRING,
  rev: { expected: "a revision — an integer from 1 — or absent", fits: (v) => v === undefined || isRevision(v) },
  type: STRING,
  hash: STRING,
  by: STRING,
  at: STRING,
  body: JSON_VALUE,
};

/** KR-07: `type` is a pinned reference `type@n` — an entity with a revision and no fragment. */
function checkType(type: string, path: string): Rejection[] {
  return isPinned(type) ? [] : [reject(KR_07, { intent: null, path: `${path}/type`, expected: "type@n", got: type })];
}

/** KR-06, KR-07, KR-08, KR-11: the grammar of every string field; a field that is no string KR-04 refuses already. */
function grammar(value: JsonObject, path: string, kind: Kind): Rejection[] {
  const { id, type, by, at } = value;
  return [
    ...(typeof id === "string" ? checkId(kind, id, { intent: null, path: `${path}/id` }) : []),
    ...(typeof type === "string" ? checkType(type, path) : []),
    ...(typeof by === "string" && !isUlid(by) ? [reject(KR_08, { intent: null, path: `${path}/by`, expected: "a ULID", got: by })] : []),
    ...(typeof at === "string" ? checkFormat("date-time", at, { intent: null, path: `${path}/at` }) : []),
  ];
}

/**
 * KR-04…KR-08: the header of a record, refused field by field at `path` — where the record sits in its input. Its
 * `id` is read by the kind the header claims — entity with `rev`, event without; whether the type agrees is the
 * question of `checkRev` (KR-05).
 */
export function checkHeader(value: JsonValue, path: string): Rejection[] {
  if (!isJsonObject(value)) return [reject(KR_04, { intent: null, path, expected: "a record", got: gotOf(value) })];
  return [...closedRejections(value, HEADER, KR_04, { intent: null, path }), ...grammar(value, path, value.rev === undefined ? "event" : "entity")];
}

/** KR-04, KR-05: `rev` is present exactly when the kind of the record's type is entity, refused at the place the caller names. */
export function checkRev(kind: Kind, rev: JsonValue | undefined, place: Place): Rejection[] {
  if (kind === "entity" && rev === undefined) return [reject(KR_04, { ...place, expected: "a revision", got: "absent" })];
  if (kind === "event" && rev !== undefined) return [reject(KR_04, { ...place, expected: "absent", got: rev })];
  return [];
}
