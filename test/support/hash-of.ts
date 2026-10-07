// The hash of a record the test knows canonical (KR-12): a test that needs the
// expected hash of a record it builds takes it here, so the copies do not drift.
import { hashRecord, type JsonValue } from "../../src/kernel/index.js";

export function hashOf(type: string, body: JsonValue): string {
  const h = hashRecord(type, body);
  if (!h.ok) throw new Error(`bug: the test record is not canonical: ${h.rejections[0].message}`);
  return h.value;
}
