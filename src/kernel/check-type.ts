// The check of a type body (KR-14…KR-17, KR-19): its form, its schema in the
// closed subset for its kind (KR-18, KR-19), its chain of parents (KR-15),
// the abstract targets of `$ref` (KR-16) and the positions of the card along
// the chain (KR-19). A body of type `core/type` is read by this check, not by
// `validate`: the subset cannot describe a schema — objects are closed and a
// keyword is no field name (G-26). Several parents are no form of `extends`
// (KR-17). The parents and targets come from the caller (KR-21); one where the
// kernel reads no type — unknown to the caller, or not admitted (Q-33) — is
// refused, since the chain cannot be shown. A record is checked against its
// type by against-type.ts, which calls this check for a type body.
import { closedRejections, type Members } from "./closed-form.js";
import { compare } from "./compare.js";
import { compareText, isJsonObject, pointer, type JsonValue } from "./json.js";
import { isPinned } from "./ref.js";
import { reject, rejectionsOf, sortRejections, type Place, type Rejection } from "./rejection.js";
import { KR_14, KR_15, KR_16, KR_19 } from "./rules.js";
import { sitesOf } from "./read-schema.js";
import { checkSchema, type Schema } from "./schema.js";
import { chainOf, MAX_DEPTH, readType, typeAt, type ResolveType, type Type } from "./type.js";

/** KR-14, KR-17: the members of a type body; `extends` absent means no parent (G-26), and several parents are no form of it. */
const MEMBERS: Members = {
  extends: { expected: "a pinned reference to one parent type, type@n", fits: (v): v is string | undefined => v === undefined || (typeof v === "string" && isPinned(v)) },
  abstract: { expected: "a boolean", fits: (v) => typeof v === "boolean" },
  kind: { expected: ["entity", "event"], fits: (v) => v === "entity" || v === "event" },
  schema: { expected: "a schema", fits: (v) => v !== undefined },
};

/** What a `$ref` wants of its target, by why the kernel reads no type there. */
const TARGETS = { "a type resolve knows": "an abstract type resolve knows", "an admitted type": "an admitted abstract type" } as const;

/** KR-16: every `$ref` of the schema names an abstract type the kernel admits. */
function refRejections(schema: Schema, resolve: ResolveType, place: Place): Rejection[] {
  return sitesOf(schema, pointer(place.path, "schema")).flatMap(({ schema: s, path }) => {
    const ref = s.$ref;
    if (typeof ref !== "string") return [];
    const target = typeAt(ref, resolve);
    if (typeof target !== "string" && target.abstract) return [];
    return [reject(KR_16, { ...place, path: pointer(path, "$ref"), expected: typeof target === "string" ? TARGETS[target] : "an abstract type", got: ref })];
  });
}

/** A position of the card: the field that holds it, by its path inside the schema, and the position. */
type Position = { readonly path: string; readonly order: number };

const positionsOf = (schema: Schema): Position[] =>
  sitesOf(schema, "").flatMap(({ schema: s, path, site }) => (site === "field" && typeof s.card_order === "number" ? [{ path, order: s.card_order }] : []));

/**
 * KR-19: positions of the card are unique along the chain — a type and its parents, nearest first. A position
 * belongs to the field of a parent that holds it, else to the first field of the type that does, by path; a child
 * may keep the position of a field it inherits.
 */
function cardRejections(types: readonly [Type, ...Type[]], place: Place): Rejection[] {
  const [own, ...parents] = types.map((t) => positionsOf(t.schema)) as [Position[], ...Position[][]];
  const inherited = parents.flat();
  const holder = (order: number): string | undefined =>
    inherited.find((p) => p.order === order)?.path ??
    own
      .filter((p) => p.order === order)
      .map((p) => p.path)
      .sort(compareText)[0];
  const expected = "a position no other field holds along the extends chain";
  return own
    .filter((p) => p.path !== holder(p.order))
    .map((p) => reject(KR_19, { ...place, path: `${place.path}/schema${p.path}/card_order`, expected, got: p.order }));
}

const CHAIN_ENDS = { cycle: "a chain of parents without a cycle", deep: `at most ${MAX_DEPTH} parents` } as const;

/** KR-15: one parent the kernel admits as a type, no cycle, at most four deep; the kind kept and the schema narrowed or kept. */
function chainRejections(type: Type, resolve: ResolveType, place: Place): Rejection[] {
  const chain = chainOf(type.extends, resolve);
  const at = pointer(place.path, "extends");
  if (chain.end === "cycle" || chain.end === "deep") return [reject(KR_15, { ...place, path: at, expected: CHAIN_ENDS[chain.end], got: chain.refs })];
  const [parent, ...rest] = chain.parents.map((l) => l.type);
  if (chain.end !== "root" || parent === undefined) return [reject(KR_15, { ...place, path: at, expected: chain.end, got: chain.refs.at(-1) ?? null })];
  const { relation } = compare(type.schema, parent.schema, "extends", resolve);
  return [
    ...(parent.kind === type.kind ? [] : [reject(KR_15, { ...place, path: pointer(place.path, "kind"), expected: parent.kind, got: type.kind })]),
    ...(relation === "narrower" || relation === "same" ? [] : [reject(KR_15, { ...place, path: pointer(place.path, "schema"), expected: ["narrower", "same"], got: relation })]),
    ...cardRejections([type, parent, ...rest], place),
  ];
}

/**
 * KR-14…KR-19: the body of a type, refused at the place the caller names — where the body sits in its input, `/body`
 * of an intent. Parents and `$ref` targets come from `resolve`; the chain and the targets are checked only on a body
 * in form. The rejections come sorted (CONVENTIONS.md §5).
 */
export function checkType(body: JsonValue, resolve: ResolveType, place: Place): Rejection[] {
  if (!isJsonObject(body)) return [reject(KR_14, { ...place, expected: "a type body {extends, abstract, kind, schema}", got: body })];
  const form = closedRejections(body, MEMBERS, KR_14, place);
  const { kind, schema } = body;
  const ofSchema = (kind === "entity" || kind === "event") && schema !== undefined ? rejectionsOf(checkSchema(schema, kind, { ...place, path: pointer(place.path, "schema") })) : [];
  const type = readType(body);
  if (form.length > 0 || ofSchema.length > 0 || type === null) return sortRejections([...form, ...ofSchema]);
  const chain = type.extends === undefined ? cardRejections([type], place) : chainRejections(type, resolve, place);
  return sortRejections([...chain, ...refRejections(type.schema, resolve, place)]);
}
