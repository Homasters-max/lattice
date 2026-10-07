// The closed form of an object: its fields against the table of its members —
// every member of its kind, no field outside the table. It is ordinary code of
// the checks that own a closed form — the header of a record (KR-04), a type
// body (KR-14), `ref` (KR-19), a commit (LG-06), a proposal and an intent
// (LG-09) — each with its own table and rule. No walk of a schema: what is
// nested the caller checks by another call (KR-18).
import { gotOf, pointer, type JsonObject, type JsonValue } from "./json.js";
import { reject, sortRejections, type Place, type Rejection, type Rule } from "./rejection.js";

/** A member of a closed form: whether a value — `undefined` when the field is absent — fits it, and what it expects. */
export type Member = { readonly expected: JsonValue; readonly fits: (v: JsonValue | undefined) => boolean };

/** The table of the members of a closed form, by field name. */
export type Members = { readonly [name: string]: Member };

/** The members of the JSON kinds the closed forms share; a member of its own kind a table writes itself. */
export const STRING: Member = { expected: "a string", fits: (v) => typeof v === "string" };
export const NUMBER: Member = { expected: "a number", fits: (v) => typeof v === "number" };
export const STRING_OR_NULL: Member = { expected: "a string or null", fits: (v) => v === null || typeof v === "string" };
export const JSON_VALUE: Member = { expected: "a JSON value", fits: (v) => v !== undefined };

/**
 * The fields of `value` against `members`, refused by `rule` at the place the caller names: a field outside the
 * table expects `absent`, a member that does not fit expects what the table says. Every path is a JSON Pointer
 * (G-13); the rejections come sorted (CONVENTIONS.md §5).
 */
export function closedRejections(value: JsonObject, members: Members, rule: Rule, place: Place): Rejection[] {
  const at = (name: string) => ({ intent: place.intent, path: pointer(place.path, name) });
  const extra = Object.keys(value)
    .filter((name) => !Object.hasOwn(members, name))
    .map((name) => reject(rule, { ...at(name), expected: "absent", got: gotOf(value[name]) }));
  const unfit = Object.entries(members)
    .filter(([name, member]) => !member.fits(value[name]))
    .map(([name, member]) => reject(rule, { ...at(name), expected: member.expected, got: gotOf(value[name]) }));
  return sortRejections([...extra, ...unfit]);
}
