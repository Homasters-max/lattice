// The rule registry of trust (CONVENTIONS.md §3.5): one constant per rule ID
// its hard checks enforce — the writers of a namespace policy (TR-09, TR-10),
// sessions and their certificates (TR-11, TR-12), and whether an act counts for
// a proposal (TR-15, TR-16). The form of a policy, of a session body and of an
// act is the schema of its type (KR-21), not a check of trust.
import type { Rule } from "../kernel/index.js";

export const TR_09 = {
  id: "TR-09",
  message: { en: "a writer entry lists the identities of one participant: github:<login>, gitlab:<user> or ssh:<key fingerprint>; expected {expected}, got {got}" },
} as const satisfies Rule;

export const TR_10 = {
  id: "TR-10",
  message: {
    en: "a writer entry binds Ed25519 keys in OpenSSH format of a human or machine participant to its kind and the roles it may take; expected {expected}, got {got}",
  },
} as const satisfies Rule;

export const TR_11 = {
  id: "TR-11",
  message: {
    en: "a session is a core/session event {id, at, body} that names the reason its purpose needs, with a certificate that has not expired when it is checked; expected {expected}, got {got}",
  },
} as const satisfies Rule;

export const TR_12 = {
  id: "TR-12",
  message: { en: "the certificate of a session is signed by a key the policy lists for its participant; expected {expected}, got {got}" },
} as const satisfies Rule;

export const TR_15 = {
  id: "TR-15",
  message: { en: "an approve act counts for the proposal whose hash it names; expected {expected}, got {got}" },
} as const satisfies Rule;

export const TR_16 = {
  id: "TR-16",
  message: { en: "acts are checked once, at their source, and an act counts only where that check passed; expected {expected}, got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [TR_09, TR_10, TR_11, TR_12, TR_15, TR_16];
