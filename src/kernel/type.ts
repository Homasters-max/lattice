// Types (KR-14…KR-17): a type is an entity whose type is the meta-type; its
// body is `{extends, abstract, kind, schema}`. The kernel never reads a store
// (KR-21): the body of a type named by a pinned reference comes from the
// caller — phase 2 resolves it over `after`, so a parent written in the same
// commit is seen too (KR-15). A type has one parent or none (KR-17): `extends`
// is one field. The kernel trusts no body the caller gives: a type it reads is
// one whose body is in form and whose schema `checkSchema` admits (Q-33), so
// every reader of a schema takes only a schema of the subset.
import type { Kind } from "./id.js";
import { isJsonObject, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { ROOT } from "./rejection.js";
import { checkSchema, type Schema } from "./schema.js";
import type { Resolve } from "./validate.js";

/** KR-14: the body of a type as the kernel reads it; `extends` absent means no parent (G-26). */
export type Type = { readonly extends?: string; readonly abstract: boolean; readonly kind: Kind; readonly schema: Schema };

/** KR-15, KR-16, KR-22: the body of the type the caller knows at a pinned reference `type@n`, or `null`. */
export type ResolveType = (ref: string) => JsonValue | null;

/** KR-15: the most `extends` links from a type to the root of its chain. */
export const MAX_DEPTH = 4;

const isKind = (v: JsonValue | undefined): v is Kind => v === "entity" || v === "event";

/** A body of a type in the form of KR-14, or `null` — whose refusals are the check of that type's own body. */
export function readType(body: JsonValue | null): Type | null {
  if (!isJsonObject(body)) return null;
  const { extends: parent, abstract, kind, schema } = body;
  if (typeof abstract !== "boolean" || !isKind(kind) || !isJsonObject(schema)) return null;
  if (parent === undefined) return { abstract, kind, schema };
  return typeof parent === "string" && isPinned(parent) ? { extends: parent, abstract, kind, schema } : null;
}

/** Why the kernel reads no type at a pinned reference: the caller knows none there, or what it gives is not admitted. */
export type Missing = "a type resolve knows" | "an admitted type";

/** KR-14, KR-18, Q-33: the type at a pinned reference — its body in form, its schema one `checkSchema` admits — or why there is none. */
export function typeAt(ref: string, resolve: ResolveType): Type | Missing {
  const body = resolve(ref);
  if (body === null) return "a type resolve knows";
  const type = readType(body);
  return type !== null && checkSchema(type.schema, type.kind, ROOT).ok ? type : "an admitted type";
}

/** KR-21: the schema of the type at a pinned reference — a `$ref` target — as the kernel admits it, or `null`. */
export const schemasOf =
  (resolve: ResolveType): Resolve =>
  (ref) => {
    const type = typeAt(ref, resolve);
    return typeof type === "string" ? null : type.schema;
  };

/** A type the chain reached, by the pinned reference it was reached at. */
export type Parent = { readonly ref: string; readonly type: Type };

/**
 * The chain of parents above a type, nearest first, as `resolve` gives them, and how it ends: at a root, at a
 * reference already met (a cycle), past `MAX_DEPTH` links, or at a reference where the kernel reads no type.
 */
export type Chain = { readonly parents: readonly Parent[]; readonly end: "root" | "cycle" | "deep" | Missing; readonly refs: readonly string[] };

/** KR-15: the parents of a type whose `extends` is `parent`, walked at most one link past `MAX_DEPTH`. */
export function chainOf(parent: string | undefined, resolve: ResolveType): Chain {
  const parents: Parent[] = [];
  const refs: string[] = [];
  for (let ref = parent; ref !== undefined; ) {
    const end = refs.includes(ref) ? "cycle" : refs.length === MAX_DEPTH ? "deep" : null;
    refs.push(ref);
    if (end !== null) return { parents, end, refs };
    const type = typeAt(ref, resolve);
    if (typeof type === "string") return { parents, end: type, refs };
    parents.push({ ref, type });
    ref = type.extends;
  }
  return { parents, end: "root", refs };
}

/** KR-15, KR-19: whether the type at `from` is the type at `to` or reaches it by `extends` — a subtype. */
export function reaches(from: string, to: string, resolve: ResolveType): boolean {
  if (from === to) return true;
  const type = typeAt(from, resolve);
  return typeof type !== "string" && chainOf(type.extends, resolve).parents.some((l) => l.ref === to);
}
