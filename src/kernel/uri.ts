// External links (KR-24): a `format: uri` value is not a reference; the kernel
// checks only that it is an absolute URI.
import type { JsonValue } from "./json.js";
import { type Place, type Rejection } from "./rejection.js";

/** KR-24: whether a string is a URI with a scheme. */
export function isUri(s: string): boolean {
  throw new Error(`bug: not implemented ${s}`);
}

/** KR-24: a URI with a scheme, refused at the place the caller names — a value that is not a string too. */
export function checkUri(value: JsonValue, place: Place): Rejection[] {
  throw new Error(`bug: not implemented ${String(value)} ${place.path}`);
}
