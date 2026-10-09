// The rule registry of the ledger (CONVENTIONS.md §3.5): one constant per rule
// ID its hard checks enforce — and those of the act a proposal counts (TR-15,
// TR-16): acts reach LATTICE only through the port `acts` of the ledger.
import type { Rule } from "../kernel/index.js";

export const LG_04 = {
  id: "LG-04",
  message: { en: "the order of knowledge is seq, dense from 1; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_05 = {
  id: "LG-05",
  message: { en: "every knowledge commit carries the hash of the previous one; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_06 = {
  id: "LG-06",
  message: {
    en: "a commit is {seq, prev, kernel, base, proposal, proposal_sig, by, at, request, sig} with its records, signed by its land session, its at never before its predecessor's; expected {expected}, got {got}",
  },
} as const satisfies Rule;

export const LG_09 = {
  id: "LG-09",
  message: { en: "a proposal is {session, intents, sig} and an intent is {op, id, type, expected, at, body}; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_10 = {
  id: "LG-10",
  message: { en: "the sig of a proposal is the signature of its hash by the session key; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_23 = {
  id: "LG-23",
  message: { en: "only landing writes store/knowledge.jsonl: a change request brings it byte for byte as at the tail of main; expected {expected}, got {got}" },
} as const satisfies Rule;

export const LG_54 = {
  id: "LG-54",
  message: { en: "a change request carries exactly one proposal in store/proposals/; expected {expected}, got {got}" },
} as const satisfies Rule;

export const TR_15 = {
  id: "TR-15",
  message: { en: "an approve act counts for the proposal whose hash it names; expected {expected}, got {got}" },
} as const satisfies Rule;

export const TR_16 = {
  id: "TR-16",
  message: { en: "acts are checked once, at their source, and an act counts only where that check passed; expected {expected}, got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [LG_04, LG_05, LG_06, LG_09, LG_10, LG_23, LG_54, TR_15, TR_16];
