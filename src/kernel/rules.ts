// The rule registry of the kernel (CONVENTIONS.md §3.5): one constant per rule
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

export const KR_07 = {
  id: "KR-07",
  message: { en: "the type of a record is a pinned reference type@n; got {got}" },
} as const satisfies Rule;

export const KR_08 = {
  id: "KR-08",
  message: { en: "by is the id of the event that wrote the record, a ULID; got {got}" },
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

export const KR_14 = {
  id: "KR-14",
  message: { en: "a type body is {extends, abstract, kind, schema}: extends an optional pinned reference to one parent, abstract a boolean, kind entity or event; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_15 = {
  id: "KR-15",
  message: { en: "extends has one parent, no cycle, is at most 4 deep, keeps the kind and only narrows the parent; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_16 = {
  id: "KR-16",
  message: { en: "an abstract type has no records and is what a $ref names; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_18 = {
  id: "KR-18",
  message: { en: "a schema holds only the keywords of the closed subset, each where it applies and in its form; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_19 = {
  id: "KR-19",
  message: { en: "an annotation sits only where the closed subset puts it, in its form; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_21 = {
  id: "KR-21",
  message: { en: "a body is valid against the schema of its type; expected {expected}, got {got}" },
} as const satisfies Rule;

export const KR_23 = {
  id: "KR-23",
  message: { en: "a reference is id, id@n or the ULID of an event, with an optional fragment #seg/seg/…; got {got}" },
} as const satisfies Rule;

export const KR_24 = {
  id: "KR-24",
  message: { en: "an external link is an absolute URI, with a scheme; got {got}" },
} as const satisfies Rule;

export const RULES: readonly Rule[] = [KR_04, KR_06, KR_07, KR_08, KR_10, KR_11, KR_13, KR_14, KR_15, KR_16, KR_18, KR_19, KR_21, KR_23, KR_24];
