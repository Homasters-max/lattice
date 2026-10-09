// compare (KR-22): one function for `extends` (KR-15), type revisions (RF-13)
// and contract revisions (RF-15). It walks A and B together, schema by
// schema, and shows each direction — every value of A is a value of B, and the
// reverse — only where the subset lets it be shown structurally; anything else
// is incomparable, the safe side (R2). Objects are closed in `revision` mode;
// in `extends` mode A is compared with B on B's fields only, at every depth.
// `$ref` is followed through the caller's `resolve` (KR-21), to a type the
// kernel admits (Q-33); a pair of
// schemas met again on the way is assumed to hold — the values under it are
// smaller, and a cycle of `$ref` that never descends admits no value. The
// walk stops at a depth and a number of steps: past them nothing is shown
// (G-27). `type: any` holds every value, so every schema is narrower than it
// or, when it says `type: any` too, the same (G-38); `$ref` is followed first,
// so a target `resolve` does not give stays incomparable even to it (G-27).
import { annotationsShown, aspectsIn } from "./compare-annotations.js";
import { ASPECTS, join, SAME, shown, UNSHOWN, type Aspect, type Shown } from "./compare-shown.js";
import { isListed, valuesWithin } from "./compare-values.js";
import { isJsonObject, own, serialize, type JsonValue } from "./json.js";
import { branchesOf, isAny, propertiesOf, requiredOf, typesOf, type Branch } from "./read-schema.js";
import type { Schema } from "./schema.js";
import { schemasOf, type ResolveType } from "./type.js";
import type { Resolve } from "./validate.js";

/** KR-22: how the values of A stand to those of B. */
export type Relation = "same" | "narrower" | "wider" | "incomparable";

/** KR-22: the relation and the aspects that differ, in the order of the rule. */
export type Comparison = { readonly relation: Relation; readonly aspects: readonly Aspect[] };

/** KR-22: `revision` — objects are closed; `extends` — A on B's fields only. */
export type Mode = "revision" | "extends";

/** How deep the walk follows inner schemas and `$ref`, and how many schemas it visits; past either, nothing is shown. */
const MAX_NESTING = 64;
const MAX_STEPS = 10_000;

/** A schema met by the walk: the reference it was named by, or the schema itself. */
type Key = string | Schema;

type Walk = {
  readonly mode: Mode;
  readonly resolve: ResolveType;
  readonly schemas: Resolve;
  readonly pairs: readonly (readonly [Key, Key])[];
  readonly depth: number;
  readonly steps: { left: number };
};

/** Whether the walk may take one more step at its depth; each call spends one. */
const spend = (walk: Walk): boolean => walk.depth <= MAX_NESTING && --walk.steps.left >= 0;

const keyOf = (s: Schema): Key => (typeof s.$ref === "string" ? s.$ref : s);

/** The schema a `$ref` names, through the caller's `resolve`; a schema without `$ref` is itself. */
const expand = (s: Schema, walk: Walk): Schema | null => (typeof s.$ref === "string" ? walk.schemas(s.$ref) : s);

/** `$ref` on either side: the same reference is the same; another is compared by the schema it names. */
function refs(a: Schema, b: Schema, walk: Walk): Shown {
  if (a.$ref === b.$ref) return SAME;
  const pair = [keyOf(a), keyOf(b)] as const;
  if (walk.pairs.some(([x, y]) => x === pair[0] && y === pair[1])) return SAME;
  const [ea, eb] = [expand(a, walk), expand(b, walk)];
  if (ea === null || eb === null || !spend(walk)) return UNSHOWN;
  return validity(ea, eb, { ...walk, pairs: [...walk.pairs, pair] });
}

/** The branches of a tagged union by the canonical text of their discriminator `const`. */
const byTag = (branches: readonly Branch[]): Map<string, Schema> => new Map(branches.map((b) => [b.key, b.schema]));

/** `oneOf` with one discriminator on both sides: a branch only one side has is a value the other lacks; a common branch is compared. */
function unions(a: Schema, b: Schema, walk: Walk): Shown {
  const { discriminator } = a;
  if (a.oneOf === undefined || b.oneOf === undefined || typeof discriminator !== "string" || discriminator !== b.discriminator) return UNSHOWN;
  const [ba, bb] = [byTag(branchesOf(a)), byTag(branchesOf(b))];
  const common = [...ba].flatMap(([tag, branch]) => {
    const other = bb.get(tag);
    return other === undefined ? [] : [node(branch, other, walk)];
  });
  return join(shown([...ba.keys()].every((t) => bb.has(t)), [...bb.keys()].every((t) => ba.has(t)), "validity"), ...common);
}

/** `items`: absent admits any item. */
function items(a: Schema, b: Schema, walk: Walk): Shown {
  if (a.items === undefined || b.items === undefined) return shown(b.items === undefined, a.items === undefined, "validity");
  return node(a.items, b.items, walk);
}

/**
 * A field of A against the same field of B. A field only one side has is a value the other refuses — objects are
 * closed — unless it is optional, and then its absence is a value both admit (KR-22).
 */
function field(name: string, a: Schema, b: Schema, walk: Walk): Shown {
  const [sa, sb] = [own(propertiesOf(a), name), own(propertiesOf(b), name)];
  const [ra, rb] = [requiredOf(a).includes(name), requiredOf(b).includes(name)];
  if (sa !== undefined && sb !== undefined) return join(shown(!rb || ra, !ra || rb, "validity"), node(sa, sb, walk));
  if (sa !== undefined) return { sub: false, sup: !ra, broken: false, aspects: aspectsIn(sa) };
  return { sub: !rb, sup: false, broken: false, aspects: aspectsIn(sb ?? null) };
}

/** The fields of two closed objects: in `revision` mode those of both, in `extends` mode those of B only (KR-22). */
function fields(a: Schema, b: Schema, walk: Walk): Shown {
  const names = walk.mode === "extends" ? Object.keys(propertiesOf(b)) : [...new Set([...Object.keys(propertiesOf(a)), ...Object.keys(propertiesOf(b))])];
  return join(SAME, ...names.map((name) => field(name, a, b, walk)));
}

/** The inner schemas of two schemas that share a JSON type that holds them: items of arrays, values of maps, fields. */
function inner(a: Schema, b: Schema, walk: Walk): Shown {
  if (isListed(a, walk.schemas) || isListed(b, walk.schemas)) return SAME;
  const both = (type: string) => typesOf(a).includes(type) && typesOf(b).includes(type);
  const maps = a.values !== undefined && b.values !== undefined;
  const objects = !both("object") || (a.values === undefined) !== (b.values === undefined) ? SAME : maps ? node(a.values, b.values, walk) : fields(a, b, walk);
  return join(both("array") ? items(a, b, walk) : SAME, objects);
}

/** The values of A against those of B: through `$ref`, against `type: any`, by branch of a union, or keyword by keyword. */
function validity(a: Schema, b: Schema, walk: Walk): Shown {
  if (typeof a.$ref === "string" || typeof b.$ref === "string") return refs(a, b, walk);
  // Every value is a value of `type: any`; no other schema of the subset holds them all: objects are closed (G-38).
  if (isAny(a) || isAny(b)) return shown(isAny(b), isAny(a), "validity");
  if (a.oneOf !== undefined || b.oneOf !== undefined) return unions(a, b, walk);
  const values = shown(valuesWithin(a, b, walk.schemas), valuesWithin(b, a, walk.schemas), "validity");
  return join(values, inner(a, b, walk));
}

/** One schema of A against one of B: their annotations and their values. */
function node(a: JsonValue | undefined, b: JsonValue | undefined, walk: Walk): Shown {
  if (!isJsonObject(a) || !isJsonObject(b) || !spend(walk)) return UNSHOWN;
  return join(annotationsShown(a, b, walk.resolve), validity(a, b, { ...walk, depth: walk.depth + 1 }));
}

function relationOf(s: Shown): Relation {
  if (s.broken) return "incomparable";
  if (s.sub) return s.sup ? "same" : "narrower";
  return s.sup ? "wider" : "incomparable";
}

/**
 * KR-22: how the values of schema A stand to those of schema B, and what differs. `same` and `narrower` are given only
 * when every value valid under A is shown valid under B — restricted to B's fields in `extends` mode; `wider` and
 * `same`, the reverse. `resolve` gives the body of a type by pinned reference: the target of `$ref` and the parents
 * of a `ref.to`.
 */
export function compare(a: Schema, b: Schema, mode: Mode, resolve: ResolveType): Comparison {
  if (serialize(a) === serialize(b)) return { relation: "same", aspects: [] };
  const s = node(a, b, { mode, resolve, schemas: schemasOf(resolve), pairs: [], depth: 0, steps: { left: MAX_STEPS } });
  return { relation: relationOf(s), aspects: ASPECTS.filter((x) => s.aspects.includes(x)) };
}
