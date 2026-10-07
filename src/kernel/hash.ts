// KR-12: hash = "sha256:" + hex(sha256(canon({type, body}))); sha256 comes
// from the platform (KR-02, D-06). KR-13: a body is at most 256 KiB of
// canonical UTF-8 bytes (G-05), a constant of the kernel version.
import { createHash } from "node:crypto";
import { canon, ROOT } from "./canon.js";
import { serialize, type JsonValue } from "./json.js";
import { refuse, reject, type Place, type Result } from "./rejection.js";
import { KR_13 } from "./rules.js";

/** KR-13, G-05: the size limit of a body in canonical UTF-8 bytes — 256 KiB, a constant of the kernel version. */
export const BODY_LIMIT = 262_144;

const digest = (data: string | Uint8Array): string => `sha256:${createHash("sha256").update(data).digest("hex")}`;

/** KR-12: the hash of the canonical bytes of a value, or the refusals of canon (KR-10) at `place`. */
export function hash(value: JsonValue, place: Place = ROOT): Result<string> {
  const text = canon(value, place);
  return text.ok ? { ok: true, value: digest(text.value) } : text;
}

/** The hash of raw bytes — a file, as evidence is named by it (LG-30) — in the form of KR-12. */
export function hashBytes(bytes: Uint8Array): string {
  return digest(bytes);
}

/**
 * KR-12: the hash of a record, entity or event, over its type and body only; refused at `place` — where the record
 * sits in its input, as an intent — when canon refuses the type or the body (KR-10), or the body is over the limit
 * (KR-13) at `/body`.
 */
export function hashRecord(type: string, body: JsonValue, place: Place = ROOT): Result<string> {
  const text = canon({ type, body }, place);
  if (!text.ok) return text;
  const size = new TextEncoder().encode(serialize(body)).length;
  if (size > BODY_LIMIT) return refuse(reject(KR_13, { ...place, path: `${place.path}/body`, expected: BODY_LIMIT, got: size }));
  return { ok: true, value: digest(text.value) };
}
