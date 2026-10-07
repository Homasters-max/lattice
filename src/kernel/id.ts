// Identity (KR-05, KR-06): whether a record is an entity or an event is the
// `kind` of its type, never a header field; an entity id is `namespace/slug`,
// an event id is a ULID.
import { isUlid } from "./formats.js";
import type { JsonValue } from "./json.js";
import { reject, type Place, type Rejection } from "./rejection.js";
import { KR_06 } from "./rules.js";

/** Whether a record is an entity or an event: the `kind` of its type (KR-05, KR-14). */
export type Kind = "entity" | "event";

const ENTITY_ID = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/;

/** KR-06: `namespace/slug`. */
export const isEntityId = (id: string): boolean => ENTITY_ID.test(id);

/** KR-06: the id of a record of this kind, refused at the place the caller names. */
export function checkId(kind: Kind, id: JsonValue, place: Place): Rejection[] {
  const fits = typeof id === "string" && (kind === "entity" ? isEntityId(id) : isUlid(id));
  return fits ? [] : [reject(KR_06, { ...place, expected: kind === "entity" ? "namespace/slug" : "a ULID", got: id })];
}
