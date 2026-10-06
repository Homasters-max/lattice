// Records (KR-04…KR-08). The walking skeleton checks only the grammar of ids
// (KR-06); the header and the formats arrive with S0-04 and S0-05.
import type { JsonValue } from "./json.js";
import { reject, type Rejection } from "./rejection.js";
import { KR_06 } from "./rules.js";

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

const ENTITY_ID = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/;
// KR-11: 26 upper-case Crockford base32 characters; G-07: at most 128 bits.
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** KR-06: `namespace/slug`. */
export const isEntityId = (id: string): boolean => ENTITY_ID.test(id);

/** KR-06, KR-11: a ULID. */
export const isUlid = (id: string): boolean => ULID.test(id);

/** KR-06: the id of a record of this kind, refused at the place the caller names. */
export function checkId(kind: Kind, id: JsonValue, at: { readonly intent: string | null; readonly path: string }): Rejection[] {
  const fits = typeof id === "string" && (kind === "entity" ? isEntityId(id) : isUlid(id));
  return fits ? [] : [reject(KR_06, { ...at, expected: kind === "entity" ? "namespace/slug" : "a ULID", got: id })];
}
