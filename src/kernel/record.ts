// Records (KR-04…KR-08). The walking skeleton checks the grammar of ids
// (KR-06) and the header on the surface — its fields and their JSON kinds — as
// a store opens (KR-04); exactly these fields, the formats and `rev` against
// the kind of the type arrive with S0-04, S0-05 and S0-13.
import { gotOf, isJsonObject, type JsonValue } from "./json.js";
import { reject, type Rejection } from "./rejection.js";
import { KR_04, KR_06 } from "./rules.js";

/** Whether a record is an entity or an event: the `kind` of its type (KR-05, KR-14). */
export type Kind = "entity" | "event";

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

/** Where a check refuses: the intent it is about, or `null`, and a JSON Pointer (G-13). */
type Place = { readonly intent: string | null; readonly path: string };

type Field = { readonly expected: string; readonly fits: (v: JsonValue | undefined) => boolean };

const STRING: Field = { expected: "a string", fits: (v) => typeof v === "string" };

const HEADER: { readonly [field in keyof Record]-?: Field } = {
  id: STRING,
  rev: { expected: "a revision or absent", fits: (v) => v === undefined || typeof v === "number" },
  type: STRING,
  hash: STRING,
  by: STRING,
  at: STRING,
  body: { expected: "a JSON value", fits: (v) => v !== undefined },
};

/** KR-04: the header of a record, refused field by field at `path` — where the record sits in its input. */
export function checkHeader(value: JsonValue, path: string): Rejection[] {
  if (!isJsonObject(value)) return [reject(KR_04, { intent: null, path, expected: "a record", got: gotOf(value) })];
  return Object.entries(HEADER).flatMap(([name, field]) =>
    field.fits(value[name]) ? [] : [reject(KR_04, { intent: null, path: `${path}/${name}`, expected: field.expected, got: gotOf(value[name]) })],
  );
}

const ENTITY_ID = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/;
// KR-11: 26 upper-case Crockford base32 characters; G-07: at most 128 bits.
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** KR-06: `namespace/slug`. */
export const isEntityId = (id: string): boolean => ENTITY_ID.test(id);

/** KR-06, KR-11: a ULID. */
export const isUlid = (id: string): boolean => ULID.test(id);

/** KR-06: the id of a record of this kind, refused at the place the caller names. */
export function checkId(kind: Kind, id: JsonValue, place: Place): Rejection[] {
  const fits = typeof id === "string" && (kind === "entity" ? isEntityId(id) : isUlid(id));
  return fits ? [] : [reject(KR_06, { ...place, expected: kind === "entity" ? "namespace/slug" : "a ULID", got: id })];
}
