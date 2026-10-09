// The sources of std as the tests of test/ledger read them (S0-08, S0-09):
// std/source/ — one type body per file, named by the slug of its id — and the
// session type of `core` that ledger code makes. The kernel resolves types
// only through the resolver a caller gives (KR-21): here, the sources
// themselves, as the ledger of `std` will hold them (S0-24).
import { checkAgainstType, isJsonObject, parseJson, rejectionsOf, ROOT, type JsonObject, type JsonValue, type ResolveType } from "../../src/kernel/index.js";
import { SESSION_TYPE } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { owned } from "../support/files.js";

export const META = "core/type@1";
export const SESSION = "core/session@1";

/** The types of S0 by TY-Z02…TY-Z05 and the scope of S0-08. */
export const S0_TYPES = [
  ...["act", "alias", "behaviour", "clause", "code", "composition", "contract", "decision", "decision-point", "domain", "example", "fact"],
  ...["hint", "implementation", "invariant", "judge-adapter", "knowledge", "namespace-policy", "port", "prose", "quality-profile", "requirement", "retired"],
  ...["scenario", "section", "setup", "stage", "term", "test-set", "valid-period"],
];

/**
 * The drafts of S0-09: the rest of TY-Z03…TY-Z05, the bench set (BN-02), the tape entry of a run (RT-23) and the
 * shape of a DecisionResult (DP-Z07); `decision-point` is in S0_TYPES and gets its fields here.
 */
export const DRAFTS = [
  ...["bench-item", "bench-set", "calibration", "code-commit", "decision-result", "delivery-attempt", "delivery-intent", "dismissed", "link", "live"],
  ...["pipeline", "question", "report", "review-note", "run", "source-listing", "step", "tape-entry", "verdict"],
];

/** Every type of std, sorted. */
export const STD_TYPES = [...S0_TYPES, ...DRAFTS].sort();

export const BASES = ["behaviour", "composition", "contract", "decision-point", "hint", "implementation", "knowledge"];

/** TR-29: the status fact types; BN-11 and TR-39 add the other facts of `knowledge`. */
export const STATUS_FACTS = ["retired", "alias", "live", "calibration", "verdict", "dismissed"];
export const FACTS = [...STATUS_FACTS, "report", "source-listing"];

/** TY-Z05: the event types of `runtime`; `tape-entry` holds the tape entries of a run (RT-23). */
export const RUNTIME_EVENTS = ["step", "link", "run", "tape-entry", "question", "delivery-intent", "delivery-attempt", "code-commit"];

/** TY-16: the base edge labels of `std`. */
export const LABELS = ["about", "caused-by", "decides", "derived-from", "implements", "measures", "part-of", "supersedes", "uses", "verifies"];

/** A file as JSON, frozen deep: the sources reach `compare` and the resolver of the kernel as they are (§1.5). */
export function json(path: string): JsonValue {
  return frozen(owned.text(path), path);
}

/** JSON text as the kernel parses it, frozen deep. */
export function frozen(text: string, what: string): JsonValue {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(`bug: ${what} is no JSON the kernel parses`);
  return deepFreeze(parsed.value);
}

export const object = (value: JsonValue | undefined): JsonObject => {
  if (value === undefined || !isJsonObject(value)) throw new Error("bug: an object was expected");
  return value;
};

export const list = (value: JsonValue | undefined): readonly JsonValue[] => {
  if (!Array.isArray(value)) throw new Error("bug: an array was expected");
  return value as readonly JsonValue[];
};

type Std = { readonly bodies: ReadonlyMap<string, JsonObject>; readonly resolve: ResolveType };

let loaded: Std | undefined;

/** The sources of std/source/ by slug, and the resolver of type bodies by pinned reference over them and `core`. */
export function std(): Std {
  if (loaded !== undefined) return loaded;
  const files = owned.list("std/source").filter((f) => f.endsWith(".json"));
  const bodies = new Map(files.map((f) => [f.slice(0, -".json".length), object(json(`std/source/${f}`))] as const));
  const resolve: ResolveType = (ref) => {
    if (ref === SESSION) return SESSION_TYPE.body;
    const slug = /^std\/([a-z0-9][a-z0-9.-]*)@1$/.exec(ref)?.[1];
    return slug === undefined ? null : (bodies.get(slug) ?? null);
  };
  loaded = { bodies, resolve };
  return loaded;
}

export const body = (slug: string): JsonObject => {
  const found = std().bodies.get(slug);
  if (found === undefined) throw new Error(`bug: no std/source/${slug}.json`);
  return found;
};

export const schemaOf = (slug: string) => object(body(slug).schema);
/** The fields of a type; a union (`oneOf`, as `decision-result`) has none at its root. */
export const fieldsOf = (slug: string) => (schemaOf(slug).oneOf === undefined ? object(schemaOf(slug).properties) : {});
export const field = (slug: string, name: string) => object(fieldsOf(slug)[name]);
export const required = (slug: string) => schemaOf(slug).required;

/** The parents of a type by slug, nearest first. */
export function parentsOf(slug: string): string[] {
  const parent = body(slug).extends;
  if (parent === undefined) return [];
  const next = typeof parent === "string" ? /^std\/(.+)@1$/.exec(parent)?.[1] : undefined;
  if (next === undefined) throw new Error(`bug: ${slug} extends no type of std`);
  return [next, ...parentsOf(next)];
}

export const check = (record: { readonly type: string; readonly rev?: number; readonly body: JsonValue }) => rejectionsOf(checkAgainstType(deepFreeze(record), std().resolve, ROOT));

/** A record of the type at `ref` with this body: `rev` only for an entity (KR-04, KR-05). */
export function recordOf(ref: string, value: JsonValue, kind: JsonValue) {
  return kind === "entity" ? { type: ref, rev: 1, body: value } : { type: ref, body: value };
}

export const nonAbstract = () => STD_TYPES.filter((slug) => body(slug).abstract === false);

/** The fields of a type that carry the annotation `key`, in their order (KR-19, TR-28). */
export const keysOf = (slug: string) => Object.entries(fieldsOf(slug)).flatMap(([name, s]) => (isJsonObject(s) && s.key === true ? [name] : []));

/** The `const` of the discriminator in each branch of a union, in order. */
export const branchesOf = (union: JsonObject) => {
  const tag = union.discriminator;
  if (typeof tag !== "string") throw new Error("bug: a union names its discriminator");
  return list(union.oneOf).map((b) => object(object(object(b).properties)[tag]).const);
};

/** An object without the fields named. */
export const without = (value: JsonObject, ...names: readonly string[]): JsonObject => Object.fromEntries(Object.entries(value).filter(([name]) => !names.includes(name)));
