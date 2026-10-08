// The closed form of an object: its fields against the table of its members —
// every member of its kind, no field outside the table. It is ordinary code of
// the checks that own a closed form — the header of a record (KR-04), a type
// body (KR-14), `ref` (KR-19), a commit (LG-06), a proposal and an intent
// (LG-09) — each with its own table and rule. No walk of a schema: what is
// nested the caller checks by another call (KR-18). A table whose members
// guard the types of the fields of `T` reads a value of `T` (`closedForm`),
// so no check casts what it has checked.
import { gotOf, pointer, type JsonObject, type JsonValue } from "./json.js";
import { refused, reject, sortRejections, type Place, type Rejection, type Result, type Rule } from "./rejection.js";

/**
 * A member of a closed form: whether a value — `undefined` when the field is absent — fits it, as a guard of the type
 * `V` it admits, and what it expects.
 */
export type Member<V extends JsonValue | undefined = JsonValue | undefined> = {
  readonly expected: JsonValue;
  readonly fits: (v: JsonValue | undefined) => v is V;
};

/** The table of the members of a closed form, by field name. */
export type Members = { readonly [name: string]: Member };

/** The table of a closed form whose value is `T`: one member per field of `T`, each admitting only that field's type. */
export type MembersOf<T> = { readonly [K in keyof Required<T>]: Member<T[K] & (JsonValue | undefined)> };

/** The members of the JSON kinds the closed forms share; a member of its own kind a table writes itself. */
export const STRING: Member<string> = { expected: "a string", fits: (v) => typeof v === "string" };
export const NUMBER: Member<number> = { expected: "a number", fits: (v) => typeof v === "number" };
export const STRING_OR_NULL: Member<string | null> = { expected: "a string or null", fits: (v) => v === null || typeof v === "string" };
export const JSON_VALUE: Member<JsonValue> = { expected: "a JSON value", fits: (v) => v !== undefined };

/**
 * The fields of `value` against `members`, refused by `rule` at the place the caller names: a field outside the
 * table expects `absent`, a member that does not fit expects what the table says. Every path is a JSON Pointer
 * (G-13); the rejections come sorted (CONVENTIONS.md §5.2).
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

/**
 * The value of a closed form, of the type its table guards, or the rejections of its fields as `closedRejections`
 * gives them, sorted.
 */
export function closedForm<T>(value: JsonObject, members: MembersOf<T>, rule: Rule, place: Place): Result<T> {
  // Every field is a member of the table and fits it, and each member guards the type of its field of T: the value is a T.
  return refused<T>(closedRejections(value, members, rule, place)) ?? { ok: true, value: value as T };
}
