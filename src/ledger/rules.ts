// The rule registry of the ledger (CONVENTIONS.md §3): one constant per rule
// ID its hard checks enforce.
import type { Rule } from "../kernel/index.js";

export const LG_09 = {
  id: "LG-09",
  message: { en: "a proposal is {session, intents, sig} and an intent is {op, id, type, expected, at, body}; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_54 = {
  id: "LG-54",
  message: { en: "a change request carries exactly one proposal in store/proposals/; got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [LG_09, LG_54];
