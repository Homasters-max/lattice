// The meta-type `core/type` (KR-14): the type of every type, typed by itself —
// the only self-reference — and made here, by kernel code. Its hash covers
// only its type and body (KR-12), so it is a constant of the kernel version
// (KR-03). Who wrote it and when — the genesis session and its time — the
// ledger writes in genesis (LG-47); the kernel knows no session (KR-01). Its
// schema describes `extends`, `abstract` and `kind`; a schema cannot be
// described in the subset — objects are closed and a keyword is no field name —
// so a body of this type is read by `checkType`, not by `validate` (G-26).
import { hashRecord } from "./hash.js";
import type { JsonValue } from "./json.js";
import type { Record } from "./record.js";

/** KR-14: the record of the meta-type as kernel code makes it: everything but `by` and `at`, which genesis gives (LG-47). */
export type MetaType = Omit<Record, "by" | "at">;

const TYPE = "core/type@1";

const BODY: JsonValue = {
  abstract: false,
  kind: "entity",
  schema: {
    type: "object",
    properties: {
      extends: { type: "string", format: "ref", description: "the one parent type, a pinned reference type@n (KR-15, KR-17)" },
      abstract: { type: "boolean", description: "an abstract type has no records (KR-16)" },
      kind: { enum: ["entity", "event"], description: "whether a record of the type is an entity or an event (KR-05)" },
      schema: { type: "object", description: "a schema of the closed subset (KR-18, KR-19), read by checkType" },
    },
    required: ["abstract", "kind", "schema"],
  },
};

/** A constant frozen through and through: records are frozen plain data (CONVENTIONS.md §1.1). */
function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) for (const inner of Object.values(value)) frozen(inner);
  return Object.freeze(value);
}

function make(): MetaType {
  const hash = hashRecord(TYPE, BODY);
  if (!hash.ok) throw new Error("bug: the body of the meta-type must be canonical");
  return frozen({ id: "core/type", rev: 1, type: TYPE, hash: hash.value, body: BODY });
}

/** KR-14: the meta-type `core/type@1`, typed by itself; its hash is a constant of the kernel version (KR-03). */
export const META_TYPE: MetaType = make();
