// Records (KR-04…KR-09). The header is exactly `{id, rev, type, hash, by, at,
// body}`. `rev` is present only for an entity, and whether a record is one is
// the `kind` of its type (KR-05), which the kernel does not hold: `checkRev`
// takes the kind from a caller that knows the type — phase 2 of one record
// (against-type.ts) — while `checkHeader`, which a store runs as it opens, before its types are
// folded, reads the kind the header claims from `rev`. `id` follows that kind
// (KR-06), `type` is a pinned reference read by the one reference parser
// (KR-07, PR-01), `by` is the ULID of the event that wrote the record (KR-08)
// and `at` a canonical date-time (KR-11) the kernel gives no meaning (KR-09).
// Whether `hash` is the hash of the record (KR-12) is not a matter of its form.
import { closedForm, JSON_VALUE, STRING, type MembersOf } from "./closed-form.js";
import { checkFormat, isUlid } from "./formats.js";
import { checkId, type Kind } from "./id.js";
import { gotOf, isJsonObject, type JsonObject, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { refuse, refused, reject, rejectionsOf, type Place, type Rejection, type Result } from "./rejection.js";
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
const isRevision = (v: JsonValue | undefined): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

const HEADER: MembersOf<Record> = {
  id: STRING,
  rev: { expected: "a revision — an integer from 1 — or absent", fits: (v) => v === undefined || isRevision(v) },
  type: STRING,
  hash: STRING,
  by: STRING,
  at: STRING,
  body: JSON_VALUE,
};

/** KR-07: `type` is a pinned reference `type@n` — an entity with a revision and no fragment. */
function checkType(type: string, place: Place): Rejection[] {
  return isPinned(type) ? [] : [reject(KR_07, { ...place, expected: "type@n", got: type })];
}

/** KR-06, KR-07, KR-08, KR-11: the grammar of every string field; a field that is no string KR-04 refuses already. */
function grammar(value: JsonObject, place: Place, kind: Kind): Rejection[] {
  const { id, type, by, at } = value;
  const of = (name: string): Place => ({ intent: place.intent, path: `${place.path}/${name}` });
  return [
    ...(typeof id === "string" ? rejectionsOf(checkId(kind, id, of("id"))) : []),
    ...(typeof type === "string" ? checkType(type, of("type")) : []),
    ...(typeof by === "string" && !isUlid(by) ? [reject(KR_08, { ...of("by"), expected: "a ULID", got: by })] : []),
    ...(typeof at === "string" ? rejectionsOf(checkFormat("date-time", at, of("at"))) : []),
  ];
}

/**
 * KR-04…KR-08: the record a header holds, or its rejections field by field at the place the caller names — where
 * the record sits in its input; sorted (CONVENTIONS.md §5). Its `id` is read by the kind the header claims — entity
 * with `rev`, event without; whether the type agrees is the question of `checkRev` (KR-05).
 */
export function checkHeader(value: JsonValue, place: Place): Result<Record> {
  if (!isJsonObject(value)) return refuse(reject(KR_04, { ...place, expected: "a record", got: gotOf(value) }));
  const form = closedForm(value, HEADER, KR_04, place);
  return refused<Record>([...rejectionsOf(form), ...grammar(value, place, value.rev === undefined ? "event" : "entity")]) ?? form;
}

/** KR-04, KR-05: `rev` is present exactly when the kind of the record's type is entity, refused at the place the caller names. */
export function checkRev(kind: Kind, rev: JsonValue | undefined, place: Place): Rejection[] {
  if (kind === "entity" && rev === undefined) return [reject(KR_04, { ...place, expected: "a revision", got: "absent" })];
  if (kind === "event" && rev !== undefined) return [reject(KR_04, { ...place, expected: "absent", got: rev })];
  return [];
}
