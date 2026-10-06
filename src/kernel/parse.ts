// Reading JSON (KR-10): input must be I-JSON — UTF-8, and JSON — and is
// refused, never repaired. `parseJson` is the one function that parses JSON in
// the code of LATTICE; until the strict parser of S0-04 replaces it, it still
// takes duplicate keys, integers outside ±2^53, strings not in NFC and -0
// (G-16).
import { hashBytes } from "./hash.js";
import type { JsonValue } from "./json.js";
import { refuse, reject, type Result } from "./rejection.js";
import { KR_10 } from "./rules.js";

/**
 * KR-10: the text of UTF-8 bytes, refused at `path` — where the bytes sit in their input — when they are not
 * UTF-8. Bytes are no JSON value: the refusal names them by their hash (CONVENTIONS.md §3, Q-19).
 */
export function decodeUtf8(bytes: Uint8Array, path = ""): Result<string> {
  try {
    // `ignoreBOM` keeps a byte order mark in the text, where the parse refuses it: by default the decoder drops it — a repair.
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return refuse(reject(KR_10, { intent: null, path, expected: "UTF-8", got: hashBytes(bytes) }));
  }
}

/** KR-10: the value of a JSON text, refused at `path` — where the text sits in its input — when it is not JSON. */
export function parseJson(text: string, path = ""): Result<JsonValue> {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch {
    return refuse(reject(KR_10, { intent: null, path, expected: "a JSON text", got: text }));
  }
}

/** KR-10: the value of JSON in UTF-8 bytes, refused at `path` as `decodeUtf8` and `parseJson` refuse. */
export function parseJsonBytes(bytes: Uint8Array, path = ""): Result<JsonValue> {
  const text = decodeUtf8(bytes, path);
  return text.ok ? parseJson(text.value, path) : text;
}
