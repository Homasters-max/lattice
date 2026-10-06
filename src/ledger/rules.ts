// The rule registry of the ledger (CONVENTIONS.md §3): one constant per rule
// ID its hard checks enforce.
import type { Rule } from "../kernel/index.js";

export const LG_06 = {
  id: "LG-06",
  message: { en: "a commit is {seq, prev, kernel, base, proposal, proposal_sig, by, at, request, sig} with its records; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_09 = {
  id: "LG-09",
  message: { en: "a proposal is {session, intents, sig} and an intent is {op, id, type, expected, at, body}; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_23 = {
  id: "LG-23",
  message: { en: "only landing appends to the store of knowledge: a change request keeps its lines as at the tail of main; line {path} differs" },
} as const satisfies Rule;

export const LG_54 = {
  id: "LG-54",
  message: { en: "a change request carries exactly one proposal in store/proposals/; expected {expected}, got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [LG_06, LG_09, LG_23, LG_54];
