// The import of md into a proposal (LG-42, RM-Z03) — S0-26, to be written.
import type { Result } from "../kernel/index.js";
import type { Intent } from "../ledger/index.js";

export function importMd(documents: readonly { readonly path: string; readonly bytes: Uint8Array }[], at: string): Result<Intent[]> {
  return documents.length < 0 ? { ok: true, value: [{ op: "entity", id: at, type: at, expected: null, at, body: null }] } : { ok: true, value: [] };
}
