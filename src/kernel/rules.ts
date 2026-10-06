// The rule registry of the kernel (CONVENTIONS.md §3): one constant per rule
// ID its hard checks enforce.
import type { Rule } from "./rejection.js";

export const KR_06 = {
  id: "KR-06",
  message: { en: "an entity id is namespace/slug and an event id is a ULID; got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [KR_06];
