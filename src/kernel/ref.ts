// References (KR-23, KR-25, PR-01): one grammar, parsed and formatted by one
// pair of functions for every reader — the header, the codec, phase 4 and
// fold. Resolution — visibility, existence, aliases, retired targets, whether
// a fragment exists — belongs to the ledger (KR-25).
import type { Kind } from "./id.js";
import { type Place, type Result } from "./rejection.js";

/** KR-23: a reference to an entity, floating or pinned at `rev`, or to an event, either with a fragment of segments. */
export type Ref =
  | { readonly kind: Extract<Kind, "entity">; readonly id: string; readonly rev?: number; readonly fragment?: readonly string[] }
  | { readonly kind: Extract<Kind, "event">; readonly id: string; readonly fragment?: readonly string[] };

const ROOT: Place = { intent: null, path: "" };

/** KR-23: the reference a string holds, refused with KR-23 at the place the caller names. */
export function parseRef(s: string, place: Place = ROOT): Result<Ref> {
  throw new Error(`bug: not implemented ${s} ${place.path}`);
}

/** KR-23: the string of a reference; `formatRef(parseRef(s))` is `s`. */
export function formatRef(r: Ref): string {
  throw new Error(`bug: not implemented ${r.id}`);
}
