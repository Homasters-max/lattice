// Canon (KR-10): the canonical form is JSON canonicalisation per RFC 8785 over
// I-JSON with every string in NFC. `canon` refuses, never repairs: -0, a number
// that is not finite, an integer outside ±(2^53−1) (G-20), a string or a key
// with a lone surrogate or a noncharacter (I-JSON, RFC 7493 §2.1) or not in NFC.
// The strict parse (parse.ts) refuses the same through the same checks; canon
// checks again because a value can be built in code, not only parsed.
import { isJsonObject, pointer, serialize, type JsonValue } from "./json.js";
import { refused, reject, type Place, type Rejection, type Result } from "./rejection.js";
import { KR_10 } from "./rules.js";

/** The root of the checked input, outside any intent (G-13). */
export const ROOT: Place = { intent: null, path: "" };

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const NONCHARACTER = /\p{Noncharacter_Code_Point}/u;

/** KR-10, I-JSON: what a string must be, or `null` when canon admits it. */
function stringExpected(s: string): string | null {
  if (LONE_SURROGATE.test(s)) return "Unicode scalar values, no lone surrogate";
  if (NONCHARACTER.test(s)) return "Unicode characters, no noncharacter";
  return s.normalize("NFC") === s ? null : "a string in NFC";
}

/** KR-10, G-20: what a number must be, or `null` when canon admits it. Every double of magnitude 2^53 or more is an integer. */
function numberExpected(x: number): string | null {
  if (!Number.isFinite(x)) return "a finite number";
  if (Object.is(x, -0)) return "a number other than -0";
  return Number.isInteger(x) && !Number.isSafeInteger(x) ? "an integer within ±(2^53−1)" : null;
}

/** KR-10: the refusal of a string — a value or a key — at its place, or none. */
export function stringRejections(s: string, place: Place): Rejection[] {
  const expected = stringExpected(s);
  return expected === null ? [] : [reject(KR_10, { ...place, expected, got: s })];
}

/** KR-10: the refusal of a number at its place, or none; `got` is the number as it came — its text, when it was parsed. */
export function numberRejections(x: number, got: JsonValue, place: Place): Rejection[] {
  const expected = numberExpected(x);
  return expected === null ? [] : [reject(KR_10, { ...place, expected, got })];
}

/** `got` of a number that is no JSON value: its spelling. */
const gotOfNumber = (x: number): JsonValue => (Object.is(x, -0) ? "-0" : Number.isFinite(x) ? x : String(x));

type Node = { readonly value: JsonValue; readonly path: string };

/** The members or items of a value with their JSON Pointers; none for a scalar. */
function childrenOf({ value, path }: Node): Node[] {
  if (Array.isArray(value)) return (value as readonly JsonValue[]).map((v, i) => ({ value: v, path: pointer(path, i) }));
  return isJsonObject(value) ? Object.keys(value).map((k) => ({ value: value[k] ?? null, path: pointer(path, k) })) : [];
}

/** What KR-10 refuses in one value itself — a string, a number, the keys of an object — not in its members. */
function ownRejections({ value, path }: Node, intent: string | null): Rejection[] {
  if (typeof value === "string") return stringRejections(value, { intent, path });
  if (typeof value === "number") return numberRejections(value, gotOfNumber(value), { intent, path });
  return isJsonObject(value) ? Object.keys(value).flatMap((k) => stringRejections(k, { intent, path: pointer(path, k) })) : [];
}

/** KR-10: every refusal in a value, at its JSON Pointer under the place; walked with its own stack, so no depth overflows. */
function canonRejections(value: JsonValue, place: Place): Rejection[] {
  const found: Rejection[] = [];
  const pending: Node[] = [{ value, path: place.path }];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    for (const r of ownRejections(node, place.intent)) found.push(r);
    for (const child of childrenOf(node)) pending.push(child);
  }
  return found;
}

/**
 * KR-10: the canonical text of a value (RFC 8785), or its refusals at their JSON Pointers under `place` — where the
 * value sits in its input, inside an intent or from the root (G-13).
 */
export function canon(value: JsonValue, place: Place = ROOT): Result<string> {
  return refused<string>(canonRejections(value, place)) ?? { ok: true, value: serialize(value) };
}
