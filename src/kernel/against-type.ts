// Phase 2 of apply for one record (LG-16): the record against its type. The
// type comes from the caller's one resolver of type bodies by pinned
// reference — over `after`, so a type written in the same commit is seen
// (LG-11) — and the kernel reads it itself: a body it has not admitted is no
// type (Q-33). Then `rev` by the kind of the type (KR-04, KR-05), no record of
// an abstract type (KR-16), and the body: a type body for the meta-type —
// its form, schema and chain of `extends` (KR-14, KR-15, KR-22, G-26) — any
// other body against the schema of its type (KR-21). The header, canon and
// formats are phase 1 (`checkHeader`). The meta-type is kernel code (KR-14):
// the kernel reads `core/type@1` from `META_TYPE`, not from the caller.
import { checkType } from "./check-type.js";
import { pointer } from "./json.js";
import { META_TYPE } from "./meta-type.js";
import { checkRev, type Record } from "./record.js";
import { reject, sortRejections, type Place, type Rejection } from "./rejection.js";
import { KR_15, KR_16 } from "./rules.js";
import { schemasOf, typeAt, type ResolveType } from "./type.js";
import { checkBody } from "./validate.js";

/** The caller's resolver, with the meta-type the kernel makes in place of whatever the caller would give for it. */
const withMetaType =
  (resolve: ResolveType): ResolveType =>
  (ref) =>
    ref === META_TYPE.type ? META_TYPE.body : resolve(ref);

/**
 * LG-16, phase 2: a record against its type, refused at the place the caller names — where the record sits in its
 * input; `rev` at `/rev`, the type at `/type`, the body under `/body`. `resolve` gives the body of a type by pinned
 * reference: the type of the record, its parents and the targets of `$ref`. The rejections come sorted
 * (CONVENTIONS.md §5).
 */
export function checkAgainstType(record: Pick<Record, "type" | "rev" | "body">, resolve: ResolveType, place: Place): Rejection[] {
  const known = withMetaType(resolve);
  const type = typeAt(record.type, known);
  const at = (name: string): Place => ({ intent: place.intent, path: pointer(place.path, name) });
  if (typeof type === "string") return [reject(KR_15, { ...at("type"), expected: type, got: record.type })];
  const abstract = type.abstract ? [reject(KR_16, { ...at("type"), expected: "a type that is not abstract", got: "an abstract type" })] : [];
  const body = record.type === META_TYPE.type ? checkType(record.body, known, at("body")) : checkBody(record.body, type.schema, schemasOf(known), at("body"));
  return sortRejections([...checkRev(type.kind, record.rev, at("rev")), ...abstract, ...body]);
}
