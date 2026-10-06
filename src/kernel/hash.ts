// KR-12: hash = "sha256:" + hex(sha256(canonical bytes)); sha256 comes from
// the platform (KR-02, D-06).
import { createHash } from "node:crypto";
import { canon, type JsonValue } from "./json.js";

/** The hash of the canonical bytes of a value. */
export function hash(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canon(value), "utf8").digest("hex")}`;
}

/** KR-12: the hash of a record, entity or event, over its type and body only. */
export function hashRecord(type: string, body: JsonValue): string {
  return hash({ type, body });
}
