// Fold (LG-35): the one pure function that holds the meaning of every
// projection — `fold(view, commit, evidence) → delta`. The projections of S0
// (LG-34): the current and the latest revision of an entity and each revision,
// referrers by references and external links (RF-09), the holder of a unique
// value (LG-19) and the evidence a commit cites; standing (TR-25) arrives with
// S0-14. Fold is total (LG-36): a dangling reference, a duplicate, a type it
// cannot read or a body its type does not admit is folded as it is — refusing
// is apply's. It reads no clock, no ids and no order of a traversal: the delta
// is sorted, and each key holds what the last record of the commit in its
// canonical order (LG-06) gives it.
import { isJsonObject, parseRef, serialize, valuesOf, type JsonValue, type Record, type ResolveType, type ValueAt } from "../kernel/index.js";
import { namespaceOf } from "../trust/index.js";
import type { Commit, Evidence } from "./commit.js";
import { currentKey, evidenceKey, holderKey, latestKey, referrerKey, revisionKey, sortRows, type Delta, type Referrer, type Rows } from "./rows.js";

/** A row a record opens: its key and value; `null` closes the row the key holds. */
type Change = readonly [key: string, value: JsonValue | null];

/** The value a key holds at a point of the commit: what an earlier record of it set, else what the view holds. */
type Peek = (key: string) => JsonValue | null;

/** The entity a pinned reference names, `id` and `rev`, or `null`. */
function pinned(ref: string): { readonly id: string; readonly rev: number } | null {
  const parsed = parseRef(ref);
  return parsed.ok && parsed.value.kind === "entity" && parsed.value.rev !== undefined ? { id: parsed.value.id, rev: parsed.value.rev } : null;
}

/** KR-15, LG-11: the body of a type by `type@n` — written in the same commit, else the revision the view holds. */
function typesOf(view: Rows, commit: Commit): ResolveType {
  return (ref) => {
    const at = pinned(ref);
    if (at === null) return null;
    const same = commit.records.filter((r) => r.id === at.id && r.rev === at.rev).at(-1);
    // A revision row holds the record fold wrote for it.
    const record = same ?? (view.row(revisionKey(at.id, at.rev))?.value as Record | undefined);
    return record?.body ?? null;
  };
}

/** KR-19, RF-06, RF-07: the edge label of a reference (`ref.label`) or of an external link (`edge`); `null` where the schema names none (G-31). */
function labelOf(at: ValueAt): string | null {
  const { ref, edge } = at.schema;
  const label = at.schema.format === "ref" ? (isJsonObject(ref) ? ref.label : undefined) : edge;
  return typeof label === "string" ? label : null;
}

/** KR-23, KR-24, RF-09: the target of a value — the `id` a reference names, or the URI of an external link — or `null`. */
function targetOf(at: ValueAt): string | null {
  if (typeof at.value !== "string") return null;
  if (at.schema.format === "uri") return at.value;
  if (at.schema.format !== "ref") return null;
  const parsed = parseRef(at.value);
  return parsed.ok ? parsed.value.id : null;
}

/** The edges and, of an entity, the unique keys of a record: the rows it opens beside its revision (RF-09, LG-19). */
function linksOf(r: Record, types: ResolveType): Change[] {
  const source = r.rev === undefined ? r.id : `${r.id}@${r.rev}`;
  const type = pinned(r.type)?.id ?? null;
  const namespace = namespaceOf(r.id);
  return valuesOf(r.body, r.type, types).flatMap((at): Change[] => {
    const target = targetOf(at);
    const out: Change[] = [];
    if (target !== null && typeof at.value === "string") {
      const referrer: Referrer = { target, label: labelOf(at), source, path: at.path, ref: at.value };
      out.push([referrerKey(referrer), referrer]);
    }
    // LG-19: uniqueness counts entities only, within the namespace of the entity.
    if (at.schema.unique === true && r.rev !== undefined && type !== null && namespace !== null) {
      out.push([holderKey({ namespace, type, path: at.path, value: at.value }), { id: r.id }]);
    }
    return out;
  });
}

/** Two values of rows alike: the same canonical JSON. A key without a row peeks `null`, which no row of fold holds. */
const same = (a: JsonValue, b: JsonValue) => serialize(a) === serialize(b);

/**
 * An entity revision: it is the current revision (until S0-14, the one written last), the latest where no higher `rev`
 * is, and a revision; the edges and unique keys of the revision it follows close where they still hold as it opened them.
 */
function entityChanges(r: Record, rev: number, peek: Peek, types: ResolveType): Change[] {
  // A current or latest row holds the record fold wrote for it.
  const before = peek(currentKey(r.id)) as Record | null;
  const latest = peek(latestKey(r.id)) as Record | null;
  const gone = before === null ? [] : linksOf(before, types).filter(([key, value]) => same(peek(key), value));
  const newest = latest === null || (latest.rev ?? 0) <= rev;
  return [
    ...gone.map(([key]): Change => [key, null]),
    [currentKey(r.id), r],
    [revisionKey(r.id, rev), r],
    ...(newest ? [[latestKey(r.id), r] satisfies Change] : []),
    ...linksOf(r, types),
  ];
}

/** The delta of what a commit makes of each key: the row the view holds closes and the new one opens, unless they hold the same. */
function deltaOf(view: Rows, seq: number, changes: ReadonlyMap<string, JsonValue | null>): Delta {
  return sortRows(
    [...changes].flatMap(([key, value]) => {
      const held = view.row(key);
      const closed = held === null ? [] : [{ ...held, to: seq }];
      if (value === null) return closed;
      if (held !== null && same(held.value, value)) return [];
      return [...closed, { key, from: seq, to: null, value }];
    }),
  );
}

/** LG-35: the delta of a commit on the view at the `seq` before it. In S0 evidence is opaque: fold reads no run from it, it marks it cited. */
export function fold(view: Rows, commit: Commit, evidence: readonly Evidence[]): Delta {
  const types = typesOf(view, commit);
  const changes = new Map<string, JsonValue | null>();
  const peek: Peek = (key) => (changes.has(key) ? (changes.get(key) ?? null) : (view.row(key)?.value ?? null));
  for (const r of commit.records) {
    const made = r.rev === undefined ? linksOf(r, types) : entityChanges(r, r.rev, peek, types);
    for (const [key, value] of made) changes.set(key, value);
  }
  for (const e of evidence) changes.set(evidenceKey(e.hash), { hash: e.hash });
  return deltaOf(view, commit.seq, changes);
}
