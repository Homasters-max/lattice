// References (KR-23, KR-25, PR-01): one grammar, parsed and formatted by one
// pair of functions for every reader — the header, the codec, phase 4 and
// fold. Resolution — visibility, existence, aliases, retired targets, whether
// a fragment exists — belongs to the ledger (KR-25).
import { isUlid } from "./formats.js";
import { isEntityId } from "./id.js";
import { refuse, reject, type Place, type Result } from "./rejection.js";
import { KR_23 } from "./rules.js";

/** KR-23: a reference to an entity, floating or pinned at `rev`, or to an event, either with a fragment of segments. */
export type Ref =
  | { readonly kind: "entity"; readonly id: string; readonly rev?: number; readonly fragment?: readonly string[] }
  | { readonly kind: "event"; readonly id: string; readonly fragment?: readonly string[] };

/** The reference without its fragment. */
type Target = { readonly kind: "entity"; readonly id: string; readonly rev?: number } | { readonly kind: "event"; readonly id: string };

const ROOT: Place = { intent: null, path: "" };

/** G-12: a revision is an integer from 1 without leading zeros; G-20: a safe integer, as every JSON integer. */
const REV = /^[1-9][0-9]*$/;

/**
 * KR-23: a segment is a field name `[a-z][a-z0-9_]*`, a map key (KR-18) or an array index. The grammar of a map key
 * holds the other two, so a segment is read by it; which of the three a segment is, the type of the target tells
 * when the ledger resolves the reference.
 */
const SEGMENT = /^[a-z0-9][a-z0-9._@-]*$/;

/** KR-23: an entity `id` or `id@n`, or the ULID of an event; `null` for anything else. */
function parseTarget(s: string): Target | null {
  const at = s.indexOf("@");
  const id = at < 0 ? s : s.slice(0, at);
  if (isUlid(id)) return at < 0 ? { kind: "event", id } : null;
  if (!isEntityId(id)) return null;
  if (at < 0) return { kind: "entity", id };
  const n = s.slice(at + 1);
  return REV.test(n) && Number.isSafeInteger(Number(n)) ? { kind: "entity", id, rev: Number(n) } : null;
}

/** KR-23: the segments of a fragment `seg/seg/…`, at least one; `null` for anything else. */
function parseFragment(s: string): string[] | null {
  const segments = s.split("/");
  return segments.every((seg) => SEGMENT.test(seg)) ? segments : null;
}

/**
 * KR-23: the reference a string holds, refused with KR-23 at the place the caller names. The fragment is read only
 * after the first `#`, so a map key that holds `@` never meets the `@n` of a pinned reference.
 */
export function parseRef(s: string, place: Place = ROOT): Result<Ref> {
  const hash = s.indexOf("#");
  const target = parseTarget(hash < 0 ? s : s.slice(0, hash));
  const fragment = hash < 0 ? undefined : parseFragment(s.slice(hash + 1));
  if (target === null || fragment === null) {
    return refuse(reject(KR_23, { ...place, expected: "id, id@n or a ULID, with an optional fragment #seg/…", got: s }));
  }
  return { ok: true, value: fragment === undefined ? target : { ...target, fragment } };
}

/**
 * KR-07, KR-18, KR-19: a pinned reference `id@n` to an entity, with no fragment — how the type of a record, a `$ref`
 * and the `to` of a `ref` annotation name a type.
 */
export function isPinned(s: string): boolean {
  const ref = parseRef(s);
  return ref.ok && ref.value.kind === "entity" && ref.value.rev !== undefined && ref.value.fragment === undefined;
}

/** KR-23: the string of a reference; `formatRef(parseRef(s))` is `s`. */
export function formatRef(r: Ref): string {
  const rev = r.kind === "entity" && r.rev !== undefined ? `@${r.rev}` : "";
  const fragment = r.fragment === undefined ? "" : `#${r.fragment.join("/")}`;
  return `${r.id}${rev}${fragment}`;
}
