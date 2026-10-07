// The rule registry of the kernel (CONVENTIONS.md §3): one constant per rule
// ID its hard checks enforce.
import type { Rule } from "./rejection.js";

export const KR_04 = {
  id: "KR-04",
  message: { en: "a record has one header {id, rev, type, hash, by, at, body}, rev only for an entity; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_06 = {
  id: "KR-06",
  message: { en: "an entity id is namespace/slug and an event id is a ULID; got {got}" },
} as const satisfies Rule;

export const KR_10 = {
  id: "KR-10",
  message: { en: "input is I-JSON in UTF-8 with every string in NFC and is refused, never repaired; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_11 = {
  id: "KR-11",
  message: { en: "a scalar of format {expected} has one canonical spelling and any other is refused; got {got}" },
} as const satisfies Rule;

export const KR_13 = {
  id: "KR-13",
  message: { en: "a body is at most {expected} bytes of canonical UTF-8, a limit of the kernel version; got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [KR_04, KR_06, KR_10, KR_11, KR_13];
