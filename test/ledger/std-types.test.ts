// The types of std as data (S0-08, S0-09; TY-01…TY-16, RT-10, TR-29, GL-01):
// the sources of std/source/ — one type body per file, named by the slug of
// its id — and the session type of `core` that ledger code makes. Each passes
// the check of the kernel as a record of `core/type@1`, each chain of
// `extends` narrows its parent, and every type that has records has a valid
// and an invalid example in test/ledger/examples/ (S0-28 reuses them). The
// kernel resolves types only through the resolver a caller gives (KR-21):
// here, the sources themselves, as the ledger of `std` will hold them (S0-24).
// The types of S0-09 are drafts: they show that the subset of KR-18 says
// what the design names before the kernel freezes as `1` (SL-03, KR-03);
// what it does not say is in plan/phases/S0-kernel-ledger/std-schema-gaps.md.
import { describe, expect, it } from "vitest";
import {
  checkAgainstType,
  compare,
  hashRecord,
  isJsonObject,
  parseJson,
  rejectionsOf,
  ROOT,
  validate,
  type JsonObject,
  type JsonValue,
  type ResolveType,
} from "../../src/kernel/index.js";
import { SESSION_TYPE } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { knowledge, owned } from "../support/files.js";

const META = "core/type@1";
const SESSION = "core/session@1";

/** The types of S0 by TY-Z02…TY-Z05 and the scope of S0-08. */
const S0_TYPES = [
  ...["act", "alias", "behaviour", "clause", "code", "composition", "contract", "decision", "decision-point", "domain", "example", "fact"],
  ...["hint", "implementation", "invariant", "judge-adapter", "knowledge", "namespace-policy", "port", "prose", "quality-profile", "requirement", "retired"],
  ...["scenario", "section", "setup", "stage", "term", "test-set", "valid-period"],
];

/**
 * The drafts of S0-09: the rest of TY-Z03…TY-Z05, the bench set (BN-02), the tape entry of a run (RT-23) and the
 * shape of a DecisionResult (DP-Z07); `decision-point` is in S0_TYPES and gets its fields here.
 */
const DRAFTS = [
  ...["bench-item", "bench-set", "calibration", "code-commit", "decision-result", "delivery-attempt", "delivery-intent", "dismissed", "link", "live"],
  ...["pipeline", "question", "report", "review-note", "run", "source-listing", "step", "tape-entry", "verdict"],
];

/** Every type of std, sorted. */
const STD_TYPES = [...S0_TYPES, ...DRAFTS].sort();

const BASES = ["behaviour", "composition", "contract", "decision-point", "hint", "implementation", "knowledge"];

/** TR-29: the status fact types; BN-11 and TR-39 add the other facts of `knowledge`. */
const STATUS_FACTS = ["retired", "alias", "live", "calibration", "verdict", "dismissed"];
const FACTS = [...STATUS_FACTS, "report", "source-listing"];

/** TY-Z05: the event types of `runtime`; `tape-entry` holds the tape entries of a run (RT-23). */
const RUNTIME_EVENTS = ["step", "link", "run", "tape-entry", "question", "delivery-intent", "delivery-attempt", "code-commit"];

/** TY-16: the base edge labels of `std`. */
const LABELS = ["about", "caused-by", "decides", "derived-from", "implements", "measures", "part-of", "supersedes", "uses", "verifies"];

/** A file as JSON, frozen deep: the sources reach `compare` and the resolver of the kernel as they are (§1.5). */
function json(path: string): JsonValue {
  return frozen(owned.text(path), path);
}

/** JSON text as the kernel parses it, frozen deep. */
function frozen(text: string, what: string): JsonValue {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(`bug: ${what} is no JSON the kernel parses`);
  return deepFreeze(parsed.value);
}

const object = (value: JsonValue | undefined): JsonObject => {
  if (value === undefined || !isJsonObject(value)) throw new Error("bug: an object was expected");
  return value;
};

const list = (value: JsonValue | undefined): readonly JsonValue[] => {
  if (!Array.isArray(value)) throw new Error("bug: an array was expected");
  return value as readonly JsonValue[];
};

type Std = { readonly bodies: ReadonlyMap<string, JsonObject>; readonly resolve: ResolveType };

let loaded: Std | undefined;

/** The sources of std/source/ by slug, and the resolver of type bodies by pinned reference over them and `core`. */
function std(): Std {
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

const body = (slug: string): JsonObject => {
  const found = std().bodies.get(slug);
  if (found === undefined) throw new Error(`bug: no std/source/${slug}.json`);
  return found;
};

const schemaOf = (slug: string) => object(body(slug).schema);
const fieldsOf = (slug: string) => object(schemaOf(slug).properties);
const field = (slug: string, name: string) => object(fieldsOf(slug)[name]);
const required = (slug: string) => schemaOf(slug).required;

/** The parents of a type by slug, nearest first. */
function parentsOf(slug: string): string[] {
  const parent = body(slug).extends;
  if (parent === undefined) return [];
  const next = typeof parent === "string" ? /^std\/(.+)@1$/.exec(parent)?.[1] : undefined;
  if (next === undefined) throw new Error(`bug: ${slug} extends no type of std`);
  return [next, ...parentsOf(next)];
}

const check = (record: { readonly type: string; readonly rev?: number; readonly body: JsonValue }) => rejectionsOf(checkAgainstType(deepFreeze(record), std().resolve, ROOT));

/** A record of the type at `ref` with this body: `rev` only for an entity (KR-04, KR-05). */
function recordOf(ref: string, value: JsonValue, kind: JsonValue) {
  return kind === "entity" ? { type: ref, rev: 1, body: value } : { type: ref, body: value };
}

const nonAbstract = () => STD_TYPES.filter((slug) => body(slug).abstract === false);

describe("the sources of the types of std (S0-08, S0-09)", () => {
  it("TY-01, TY-02: std/source holds one type body per file, named by its slug — every type of std", () => {
    expect([...std().bodies.keys()].sort()).toEqual(STD_TYPES);
  });

  it("TY-01, KR-14, KR-15, KR-18, KR-19: every source passes the check of the kernel as a record of core/type@1", () => {
    const refused = STD_TYPES.map((slug) => [slug, check({ type: META, rev: 1, body: body(slug) })] as const).filter(([, r]) => r.length > 0);
    expect(refused).toEqual([]);
  });

  it("KR-15: every chain of extends narrows its parent or keeps it", () => {
    const relations = STD_TYPES.flatMap((slug) => {
      const [parent] = parentsOf(slug);
      return parent === undefined ? [] : [[slug, compare(schemaOf(slug), schemaOf(parent), "extends", std().resolve).relation] as const];
    });
    expect(relations.length).toBeGreaterThan(0);
    expect(relations.filter(([, r]) => r !== "narrower" && r !== "same")).toEqual([]);
  });

  it("KR-19, RF-10: positions of the card are unique along each chain and follow the column Card of TY-Z03", () => {
    const card = (slug: string) =>
      Object.entries(fieldsOf(slug))
        .flatMap(([name, s]) => (isJsonObject(s) && typeof s.card_order === "number" ? [[s.card_order, name] as const] : []))
        .sort(([a], [b]) => a - b);
    for (const slug of STD_TYPES) {
      const orders = [slug, ...parentsOf(slug)].flatMap((s) => card(s).map(([o]) => o));
      expect([slug, new Set(orders).size]).toEqual([slug, card(slug).length]);
    }
    const cards = ["requirement", "scenario", "decision", "invariant", "term", "clause", "prose", "example", "bench-item", "review-note"].map((s) => [s, card(s).map(([, n]) => n)]);
    expect(cards).toEqual([
      ["requirement", ["title", "statement"]],
      ["scenario", ["title", "when", "then"]],
      ["decision", ["title", "choice"]],
      ["invariant", ["title", "statement"]],
      ["term", ["term", "definition"]],
      ["clause", ["cells"]],
      ["prose", ["text"]],
      ["example", ["text"]],
      ["bench-item", []],
      ["review-note", ["note"]],
    ]);
  });
});

describe("the base types and what extends them", () => {
  it("TY-03, G-02, G-39: each base type is a root entity type with an optional supersedes of pinned references, label supersedes; all but decision-point are abstract", () => {
    const own: Record<string, readonly string[]> = { implementation: ["contract", "code"], "decision-point": ["candidates", "question", "judge", "policy", "bench", "targets"] };
    for (const base of BASES) {
      expect([base, body(base).extends, body(base).abstract, body(base).kind, required(base)]).toEqual([base, undefined, base !== "decision-point", "entity", own[base] ?? []]);
      expect([base, field(base, "supersedes")]).toEqual([
        base,
        {
          type: "array",
          items: { type: "string", format: "ref", ref: { to: `std/${base}@1`, pin: "pinned", label: "supersedes" } },
          description: "the pinned last revisions of the blocks this one replaces (TY-03, RF-12)",
        },
      ]);
    }
  });

  it("TY-03: every entity type with records extends one of the base types and keeps its supersedes", () => {
    const entities = nonAbstract().filter((slug) => body(slug).kind === "entity");
    expect(entities.map((slug) => [slug, parentsOf(slug).at(-1) ?? slug]).filter(([, root]) => !BASES.includes(root))).toEqual([]);
    expect(entities.filter((slug) => fieldsOf(slug).supersedes === undefined)).toEqual([]);
  });

  it("TY-05, GL-01: domain and section extend composition; the content blocks are the knowledge and composition types", () => {
    const content = nonAbstract().filter((slug) => parentsOf(slug).some((p) => p === "knowledge" || p === "composition"));
    expect(content).toEqual(["bench-item", "bench-set", "clause", "decision", "domain", "example", "invariant", "prose", "requirement", "scenario", "section", "term"]);
    expect([parentsOf("domain"), parentsOf("section")]).toEqual([["composition"], ["composition"]]);
    expect(required("domain")).toEqual(["items"]);
    expect(required("section")).toEqual(["heading", "level", "items"]);
    const branches = list(object(field("section", "items").items).oneOf).map((b) => Object.keys(object(object(b).properties)));
    expect(branches).toEqual([
      ["item", "ref"],
      ["item", "header"],
    ]);
  });

  it("LG-42, KR-18, G-01: refs sit on the base knowledge, table and list on clause, prose and example", () => {
    expect(object(field("knowledge", "refs").items).ref).toEqual({ to: "std/knowledge@1", pin: "floating", label: "about" });
    const attached = ["clause", "prose", "example", "requirement", "term"].map((slug) => [slug, "table" in fieldsOf(slug), "list" in fieldsOf(slug)]);
    expect(attached).toEqual([
      ["clause", true, true],
      ["prose", true, true],
      ["example", true, true],
      ["requirement", false, false],
      ["term", false, false],
    ]);
  });
});

describe("contracts and implementations", () => {
  it("TY-06, TY-07, RT-08: stage and port extend contract; their shapes are pinned references to types; the class of an operation is closed", () => {
    expect([parentsOf("stage"), parentsOf("port")]).toEqual([["contract"], ["contract"]]);
    for (const name of ["input", "output", "params"]) expect(field("stage", name).ref).toEqual({ to: "core/type@1", pin: "pinned", label: "uses" });
    expect(object(field("stage", "uses").items).ref).toEqual({ to: "std/port@1", pin: "pinned", label: "uses" });
    const operation = object(object(field("port", "operations").values).properties);
    expect([Object.keys(operation), object(operation.class).enum]).toEqual([
      ["input", "output", "class", "idempotent", "memo"],
      ["read", "write", "llm", "irreversible"],
    ]);
  });

  it("TY-11, TY-12: code is the abstract shape {module, hash}; an implementation holds a contract, label implements, and code; judge-adapter adds model", () => {
    expect([body("code").abstract, required("code")]).toEqual([true, ["module", "hash"]]);
    expect([field("implementation", "contract").ref, field("implementation", "code").$ref]).toEqual([{ to: "std/contract@1", pin: "pinned", label: "implements" }, "std/code@1"]);
    expect([parentsOf("judge-adapter"), required("judge-adapter"), field("judge-adapter", "contract").ref]).toEqual([
      ["implementation"],
      ["contract", "code", "model"],
      { to: "std/port@1", pin: "pinned", label: "implements" },
    ]);
  });

  it("TY-13: test-set extends behaviour, never implementation; its contract and covers carry the label verifies", () => {
    expect([parentsOf("test-set"), field("test-set", "contract").ref, object(field("test-set", "covers").items).ref, field("test-set", "code").$ref]).toEqual([
      ["behaviour"],
      { to: "std/contract@1", pin: "pinned", label: "verifies" },
      { to: "std/scenario@1", pin: "any", label: "verifies" },
      "std/code@1",
    ]);
  });

});

describe("behaviour", () => {
  it("RT-10, RT-31: setup is a behaviour type — stage bindings with executor, port bindings with adapter, executor, mode and memoization, the judge port with mode and memoization only; no bindings is a setup", () => {
    const binding = (name: string) => object(field("setup", name).items);
    const judge = field("setup", "judge");
    expect([parentsOf("setup"), required("setup"), list(binding("stages").required), list(binding("ports").required)]).toEqual([
      ["behaviour"],
      ["stages", "ports"],
      ["contract", "implementation", "executor"],
      ["port", "adapter", "mode", "executor"],
    ]);
    expect([Object.keys(object(binding("ports").properties)), Object.keys(object(judge.properties)), judge.required]).toEqual([
      ["port", "adapter", "mode", "memo", "executor"],
      ["mode", "memo"],
      ["mode"],
    ]);
    expect(check({ type: "std/setup@1", rev: 1, body: { stages: [], ports: [] } })).toEqual([]);
  });

  it("TR-02, ST-09: namespace-policy holds the fields of a namespace policy; quality-profile its limits", () => {
    expect([parentsOf("namespace-policy"), Object.keys(fieldsOf("namespace-policy"))]).toEqual([
      ["behaviour"],
      ["supersedes", "owner", "writers", "roles", "pins", "acts", "recovery", "delegation", "labels", "budget", "quality"],
    ]);
    expect([parentsOf("quality-profile"), required("quality-profile")]).toEqual([["behaviour"], ["complexity", "function_lines", "nesting", "parameters", "file_lines"]]);
  });

  it("TY-16, TR-03, RF-07: the labels of TY-16 are labels of the policy of namespace std (std/namespace, of type std/namespace-policy), and every label of std is one of them", () => {
    const policy = object(json("std/namespace.json"));
    expect(check({ type: "std/namespace-policy@1", rev: 1, body: policy })).toEqual([]);
    expect(Object.keys(object(policy.labels)).sort()).toEqual(LABELS);
    const used = new Set<string>();
    const walk = (value: JsonValue): void => {
      if (Array.isArray(value)) list(value).forEach(walk);
      if (!isJsonObject(value)) return;
      const label = isJsonObject(value.ref ?? null) ? object(value.ref).label : value.edge;
      if (typeof label === "string") used.add(label);
      Object.values(value).forEach(walk);
    };
    STD_TYPES.forEach((slug) => walk(schemaOf(slug)));
    expect([...used].filter((l) => !LABELS.includes(l))).toEqual([]);
  });
});

describe("events", () => {
  it("TR-14: act is an event type with the verb of the act", () => {
    expect([body("act").kind, body("act").extends, field("act", "verb").enum]).toEqual(["event", undefined, ["approve", "answer", "acknowledge"]]);
  });

  it("TY-14, TR-28, TR-29: fact is an abstract event shape whose of is the key; retired and alias extend it", () => {
    expect([body("fact").abstract, body("fact").kind, required("fact"), field("fact", "of").key, "revoked" in fieldsOf("fact")]).toEqual([true, "event", ["of"], true, true]);
    for (const slug of ["retired", "alias"]) {
      expect([slug, parentsOf(slug), body(slug).kind, field(slug, "of").key, object(field(slug, "of").properties).entity !== undefined]).toEqual([slug, ["fact"], "event", true, true]);
    }
    expect(["value" in fieldsOf("retired"), field("alias", "value").format]).toEqual([false, "ref"]);
  });

  it("TY-15: valid-period is the abstract shape {valid_from, valid_to}, null meaning open", () => {
    expect([body("valid-period").abstract, required("valid-period"), field("valid-period", "valid_from").type, field("valid-period", "valid_to").type]).toEqual([
      true,
      ["valid_from", "valid_to"],
      ["string", "null"],
      ["string", "null"],
    ]);
  });

  it("TY-01, TR-11: core/session is the event type ledger code makes, its hash that of its type and body", () => {
    const hash = hashRecord(META, SESSION_TYPE.body);
    expect([SESSION_TYPE.id, SESSION_TYPE.rev, SESSION_TYPE.type, hash.ok && hash.value === SESSION_TYPE.hash, Object.isFrozen(SESSION_TYPE.body)]).toEqual([
      "core/session",
      1,
      META,
      true,
      true,
    ]);
    const schema = object(object(SESSION_TYPE.body).schema);
    expect([object(SESSION_TYPE.body).kind, Object.keys(object(schema.properties))]).toEqual([
      "event",
      ["participant", "kind", "role", "purpose", "for", "parent", "software", "version", "certificate"],
    ]);
    expect(check({ type: META, rev: 1, body: SESSION_TYPE.body })).toEqual([]);
  });
});

/** The fields of a type that carry the annotation `key`, in their order (KR-19, TR-28). */
const keysOf = (slug: string) => Object.entries(fieldsOf(slug)).flatMap(([name, s]) => (isJsonObject(s) && s.key === true ? [name] : []));

/** The `const` of the discriminator in each branch of a union, in order. */
const branchesOf = (union: JsonObject) =>
  list(union.oneOf).map((b) => {
    const tag = object(object(b).properties)[String(union.discriminator)];
    return object(tag).const;
  });

describe("the drafts of S0-09: behaviour, decision points and the bench", () => {
  it("RT-01, RT-04, RT-05, G-40: a pipeline extends behaviour — stages that pin a stage contract with static params, reads, writes, on and fallback; bench and targets are optional (DP-31)", () => {
    const stage = object(field("pipeline", "stages").items);
    expect([parentsOf("pipeline"), required("pipeline"), Object.keys(object(stage.properties)), stage.required]).toEqual([
      ["behaviour"],
      ["stages"],
      ["stage", "params", "reads", "writes", "on", "fallback"],
      ["stage", "reads", "writes"],
    ]);
    const on = object(object(stage.properties).on);
    expect([object(object(stage.properties).stage).ref, object(on.values).enum, object(object(stage.properties).fallback).ref]).toEqual([
      { to: "std/stage@1", pin: "pinned", label: "uses" },
      ["continue", "fallback", "escalate", "refuse"],
      { to: "std/stage@1", pin: "pinned", label: "uses" },
    ]);
    expect([object(field("pipeline", "targets").values).type, field("pipeline", "bench").format]).toEqual(["number", "ref"]);
  });

  it("DP-01, DP-02, DP-05, DP-13, G-39, G-43: a decision point holds an allowed set, a question, a pinned judge, a policy of the closed operators, a bench set and targets", () => {
    const question = object(field("decision-point", "question").properties);
    expect([object(question.kind).enum, object(question.score_semantics).enum]).toEqual([
      ["choice", "score", "binary"],
      ["relevance", "confidence", "preference"],
    ]);
    expect(field("decision-point", "judge").ref).toEqual({ to: "std/judge-adapter@1", pin: "pinned", label: "uses" });
    expect(branchesOf(field("decision-point", "policy"))).toEqual(["threshold", "top-k", "margin", "budget", "any", "all", "table"]);
    expect(Object.keys(object(field("decision-point", "targets").properties))).toEqual(["precision", "consistency", "tolerance"]);
  });

  it("BN-01…BN-04, G-44: a bench item extends knowledge with its kind and variants; a bench set extends composition with pinned items and its salt", () => {
    expect([parentsOf("bench-item"), field("bench-item", "kind").enum, required("bench-item")]).toEqual([["knowledge"], ["normal", "trap", "blank"], ["kind", "input", "expected"]]);
    expect([parentsOf("bench-set"), required("bench-set"), object(field("bench-set", "items").items).ref]).toEqual([
      ["composition"],
      ["items", "salt"],
      { to: "std/bench-item@1", pin: "pinned", label: "part-of" },
    ]);
  });

  it("TY-04: a review note extends hint and names what it says is not met: a note without a subject is refused by its schema", () => {
    expect([parentsOf("review-note"), required("review-note")]).toEqual([["hint"], ["about", "subject", "note"]]);
    const note = check({ type: "std/review-note@1", rev: 1, body: { about: "demo/order-intake@2", note: "the scenario misses a refund" } });
    expect(note.map((r) => [r.rule, r.path, r.expected])).toEqual([["KR-21", "/body/subject", { required: "present" }]]);
  });
});

describe("the drafts of S0-09: facts and events", () => {
  it("TY-14, TR-29, BN-11, TR-39, G-41: every fact type extends fact; of and the other fields of its key carry key; status facts and the value of each follow TR-29", () => {
    const facts = STD_TYPES.filter((slug) => parentsOf(slug).includes("fact"));
    expect(facts.sort()).toEqual([...FACTS].sort());
    const shapes = FACTS.map((slug) => [slug, body(slug).kind, keysOf(slug), Object.keys(object(field(slug, "of").properties)), "value" in fieldsOf(slug)]);
    expect(shapes).toEqual([
      ["retired", "event", ["of"], ["entity"], false],
      ["alias", "event", ["of"], ["entity"], true],
      ["live", "event", ["of"], ["pipeline"], true],
      ["calibration", "event", ["of", "question"], ["point", "judge", "set"], true],
      ["verdict", "event", ["of", "participant"], ["subject"], true],
      ["dismissed", "event", ["of", "rule"], ["subject"], false],
      ["report", "event", ["of", "split"], ["subject", "set"], true],
      ["source-listing", "event", ["of"], ["source"], true],
    ]);
    expect(FACTS.filter((slug) => list(required(slug)).some((k) => !keysOf(slug).includes(String(k))))).toEqual([]);
    expect([Object.keys(object(field("live", "value").properties)), field("verdict", "value").enum, field("report", "split").enum]).toEqual([
      ["pipeline", "setup", "tuple"],
      ["for", "against"],
      ["tune", "holdout"],
    ]);
    expect(object(object(field("report", "value").properties).runs).items).toMatchObject({ format: "ref", ref: { to: "std/run@1", label: "measures" } });
  });

  it("TY-14: no type of std extends a status fact", () => {
    expect(STD_TYPES.filter((slug) => STATUS_FACTS.includes(parentsOf(slug)[0] ?? ""))).toEqual([]);
  });

  it("TY-Z05, OB-01, OB-02, OB-08, RT-14, RT-18, RT-23, RT-26: the events of runtime are root event types; a code-commit is keyed by its sha", () => {
    expect(RUNTIME_EVENTS.map((slug) => [slug, body(slug).kind, body(slug).extends, body(slug).abstract])).toEqual(RUNTIME_EVENTS.map((slug) => [slug, "event", undefined, false]));
    expect(RUNTIME_EVENTS.filter((slug) => keysOf(slug).length > 0).map((slug) => [slug, keysOf(slug)])).toEqual([["code-commit", ["sha"]]]);
    expect([field("step", "kind").enum, field("step", "billing").enum, field("delivery-attempt", "status").enum]).toEqual([
      ["skill", "tool", "land", "cite", "bench"],
      ["api", "subscription", "local"],
      ["started", "done", "failed"],
    ]);
    const model = object(field("tape-entry", "model").properties);
    expect([field("tape-entry", "mode").enum, object(model.check).enum, required("tape-entry")]).toEqual([
      ["service", "recorded", "fixture"],
      ["verified", "reported", "none"],
      ["operation", "request", "occurrence", "ms", "billing", "mode"],
    ]);
    expect(required("delivery-intent")).toEqual(["operation", "key", "payload", "stage"]);
  });

  it("RT-14, RT-15, DP-08: a run holds its pipeline, setup, input, fingerprint, execution tuple, commit, budget, spending, the outcome of every stage and its own; decide keeps its DecisionResult by $ref", () => {
    expect(required("run")).toEqual(["pipeline", "setup", "input", "fingerprint", "tuple", "commit", "budget", "spending", "stages", "outcome"]);
    expect(Object.keys(object(field("run", "tuple").properties))).toEqual(["implementations", "judges", "ports", "lattice", "pins"]);
    expect(object(object(object(field("run", "stages").items).properties).result).$ref).toEqual("std/decision-result@1");
  });

  it("DP-08: a DecisionResult is an abstract union by status, each status with its closed set of reasons; selected has none", () => {
    const union = schemaOf("decision-result");
    const reasons = list(union.oneOf).map((b) => {
      const reason = object(object(b).properties).reason;
      if (reason === undefined) return null;
      return object(reason).const ?? object(reason).enum;
    });
    expect([body("decision-result").abstract, branchesOf(union), reasons]).toEqual([
      true,
      ["selected", "none", "ambiguous", "insufficient", "unavailable"],
      [null, "threshold", "margin", ["budget", "no-candidates"], ["timeout", "network", "schema", "model", "coverage"]],
    ]);
  });
});

/** The JSON of the fenced block `id` of a design file (RM-Z03): the examples of the design, as the design writes them. */
function designBlock(file: string, id: string): JsonObject {
  const text = knowledge.text(file).replaceAll("\r\n", "\n");
  const found = new RegExp("```json " + id + "\\n([\\s\\S]*?)\\n```").exec(text)?.[1];
  if (found === undefined) throw new Error(`bug: ${file} has no block ${id}`);
  return object(frozen(found, `${file} ${id}`));
}

/** A record the design writes with its header inline: its `type`, and the body without `type` and `id`. */
function recordOfDesign(example: JsonObject) {
  const { type, id: _id, ...rest } = example;
  if (typeof type !== "string") throw new Error("bug: a design example names no type");
  return { type, rev: 1, body: rest };
}

describe("the examples of the design (S0-09)", () => {
  it("DP-01: the decision point of DP-Z05 is valid by the draft of decision-point", () => {
    const record = recordOfDesign(designBlock("08-decision.md", "DP-Z05"));
    expect([record.type, check(record)]).toEqual(["std/decision-point@1", []]);
  });

  it("RT-01, G-38: the pipeline of RT-Z02 is valid by the draft of pipeline but for the static params, which the subset cannot type until the owner decides G-38", () => {
    const record = recordOfDesign(designBlock("07-runtime.md", "RT-Z02"));
    expect(record.type).toBe("std/pipeline@1");
    expect(check(record).map((r) => [r.rule, r.path, r.expected])).toEqual([
      ["KR-21", "/body/stages/0/params/pool_max", { properties: "absent" }],
      ["KR-21", "/body/stages/1/params/point", { properties: "absent" }],
    ]);
  });

  it("DP-08: DP-Z07 names the statuses, reasons and score semantics of the draft, and each status of it, filled in, is a valid DecisionResult", () => {
    const template = designBlock("08-decision.md", "DP-Z07");
    const alternatives = (value: JsonValue | undefined) => String(value).split(" | ");
    const union = schemaOf("decision-result");
    const evaluation = object(list(template.evaluations)[0]);
    const branchReasons = list(union.oneOf).flatMap((b) => {
      const reason = object(object(b).properties).reason;
      return reason === undefined ? [] : list(object(reason).enum ?? [object(reason).const ?? null]);
    });
    const semantics = object(object(object(object(object(list(union.oneOf)[0]).properties).evaluations).items).properties).score_semantics;
    expect([alternatives(template.status), alternatives(template.reason), alternatives(evaluation.score_semantics)]).toEqual([branchesOf(union), branchReasons, object(semantics).enum]);
    const schemas = (ref: string): JsonObject | null => {
      const slug = /^std\/(.+)@1$/.exec(ref)?.[1];
      return slug === undefined || !std().bodies.has(slug) ? null : schemaOf(slug);
    };
    // Each status of DP-Z07 with the first reason of its own set, and its placeholders <ref@n> filled in.
    const { reason: _reason, ...rest } = template;
    const ref = "acme/tool-a@1";
    const filled = list(union.oneOf).map((branch) => {
      const props = object(object(branch).properties);
      const reason = props.reason === undefined ? undefined : (object(props.reason).const ?? list(object(props.reason).enum)[0]);
      const value: JsonObject = {
        ...rest,
        status: object(props.status).const ?? null,
        selected: [ref],
        evaluations: [{ ...evaluation, candidate: ref, score_semantics: "preference" }],
        inputs: { ...object(template.inputs), point: "acme/pick-tool@1", candidates: [ref] },
      };
      return reason === undefined ? value : { ...value, reason };
    });
    expect(filled.map((v) => [v.status, validate(deepFreeze(v), union, schemas)])).toEqual(filled.map((v) => [v.status, { ok: true }]));
  });
});

describe("examples of the types with records", () => {
  /** The examples of a file: valid bodies, and invalid ones with the path and keyword of the violation each breaks. */
  const examplesOf = (path: string) => {
    const file = object(json(path));
    const invalid = list(file.invalid).map((e) => {
      const { path: at, keyword, body: value } = object(e);
      if (typeof at !== "string" || typeof keyword !== "string" || value === undefined) throw new Error(`bug: ${path} holds an invalid example out of form`);
      return { path: at, keyword, body: value };
    });
    return { valid: list(file.valid), invalid };
  };

  const cases = () => [
    ...nonAbstract().map((slug) => ({ ref: `std/${slug}@1`, kind: body(slug).kind ?? null, path: `test/ledger/examples/std/${slug}.json` })),
    { ref: SESSION, kind: "event" as JsonValue, path: "test/ledger/examples/core/session.json" },
  ];

  it("KR-16: a type without records has no example; every type with records has one", () => {
    expect(owned.list("test/ledger/examples/std").sort()).toEqual(nonAbstract().map((slug) => `${slug}.json`));
  });

  it("KR-21: every valid example passes the check of its type, and the same example with a field more does not", () => {
    for (const { ref, kind, path } of cases()) {
      const { valid } = examplesOf(path);
      expect([ref, valid.length > 0]).toEqual([ref, true]);
      for (const value of valid) {
        expect([ref, check(recordOf(ref, value, kind))]).toEqual([ref, []]);
        const more = check(recordOf(ref, { ...object(value), extra: true }, kind));
        expect([ref, more.map((r) => [r.rule, r.path, r.expected])]).toEqual([ref, [["KR-21", "/body/extra", { properties: "absent" }]]]);
      }
    }
  });

  it("KR-21: every invalid example is refused at its path by its keyword", () => {
    for (const { ref, kind, path } of cases()) {
      const { invalid } = examplesOf(path);
      expect([ref, invalid.length > 0]).toEqual([ref, true]);
      for (const example of invalid) {
        const refused = check(recordOf(ref, example.body, kind)).map((r) => [r.rule, r.path, Object.keys(object(r.expected))]);
        expect([ref, refused]).toEqual([ref, [["KR-21", `/body${example.path}`, [example.keyword]]]]);
      }
    }
  });
});
