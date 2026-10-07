// The annotations of one schema against another (KR-22, KR-19): the graph —
// `ref`, `edge`, `unique`, `key` — and the presentation — `card_order`,
// `description`. A changed label, edge or key breaks the pair: the relation
// is incomparable, an annotation added or removed included. `pinned` and
// `floating` are each narrower than `any`; a `ref.to` that reaches the other
// by `extends` is narrower; added `unique` is narrower. Presentation never
// moves the relation.
import { broken, join, SAME, shown, type Aspect, type Shown } from "./compare-shown.js";
import { isJsonObject, serialize, type JsonValue } from "./json.js";
import { sitesOf } from "./read-schema.js";
import type { Schema } from "./schema.js";
import { reaches, type ResolveType } from "./type.js";

const differ = (a: JsonValue | undefined, b: JsonValue | undefined): boolean =>
  a === undefined || b === undefined ? a !== b : serialize(a) !== serialize(b);

/** `card_order` and `description`: listed when they differ, the relation untouched. */
function presentation(a: Schema, b: Schema): Shown {
  const aspects = (["card_order", "description"] as const).filter((k) => differ(a[k], b[k]));
  return { ...SAME, aspects };
}

/** `unique: true` narrows: B unique needs A unique, and the reverse. */
function unique(a: Schema, b: Schema): Shown {
  const [ua, ub] = [a.unique === true, b.unique === true];
  return shown(!ub || ua, !ua || ub, "unique");
}

/** A pinned reference `to` within another: the same type or one that reaches it by `extends`. */
const toWithin = (a: JsonValue | undefined, b: JsonValue | undefined, resolve: ResolveType): boolean =>
  typeof a === "string" && typeof b === "string" && reaches(a, b, resolve);

/** `pin` within another: the same, or anything within `any`. */
const pinWithin = (a: JsonValue | undefined, b: JsonValue | undefined): boolean => a === b || b === "any";

/** `ref: {to, pin, label}`: the label kept, `pin` and `to` narrowed or kept. */
function ref(a: Schema, b: Schema, resolve: ResolveType): Shown {
  const [ra, rb] = [a.ref, b.ref];
  if (ra === undefined && rb === undefined) return SAME;
  if (!isJsonObject(ra) || !isJsonObject(rb) || differ(ra.label, rb.label)) return broken("ref");
  const sub = pinWithin(ra.pin, rb.pin) && toWithin(ra.to, rb.to, resolve);
  const sup = pinWithin(rb.pin, ra.pin) && toWithin(rb.to, ra.to, resolve);
  return shown(sub, sup, "ref");
}

/** KR-22, KR-19: the annotations of A against those of B at one schema. */
export function annotationsShown(a: Schema, b: Schema, resolve: ResolveType): Shown {
  const changed = (["edge", "key"] as const).filter((k) => differ(a[k], b[k])).map(broken);
  return join(presentation(a, b), unique(a, b), ref(a, b, resolve), ...changed);
}

const ANNOTATED: readonly Aspect[] = ["ref", "edge", "unique", "key", "card_order", "description"];

/** The aspects a schema that only one side holds brings: its validity and every annotation in it. */
export function aspectsIn(schema: JsonValue): Aspect[] {
  const found = sitesOf(schema, "").flatMap(({ schema: s }) => ANNOTATED.filter((k) => s[k] !== undefined));
  return ["validity", ...new Set(found)];
}
