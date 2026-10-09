// The rule registry of the codec (CONVENTIONS.md §3.5): one constant per rule
// ID its hard checks enforce. Bytes that are not UTF-8 are refused by the
// kernel's `decodeUtf8` under KR-10 (G-25).
import type { Rule } from "../kernel/index.js";

export const LG_42 = {
  id: "LG-42",
  message: { en: "md is canonical and is refused, never repaired; expected {expected}, got {got} at {path}" },
} as const satisfies Rule;

export const RM_01 = {
  id: "RM-01",
  message: { en: "one ID — one block: every block of md has an ID — a table row whose first cell is its ID or a paragraph that starts with it — and no two blocks share one; expected {expected}, got {got} at {path}" },
} as const satisfies Rule;

export const RM_02 = {
  id: "RM-02",
  message: { en: "an ID is <PREFIX>-<NN> or <PREFIX>-Z<NN>; got {got} at {path}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [LG_42, RM_01, RM_02];
