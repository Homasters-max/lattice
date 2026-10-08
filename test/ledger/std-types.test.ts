// The types of S0 as data (S0-08; TY-01…TY-16, RT-10, TR-29, GL-01): the
// sources of std/source/ — one type body per file, named by the slug of its
// id — and the session type of `core` that ledger code makes. Each passes the
// check of the kernel as a record of `core/type@1`, each chain of `extends`
// narrows its parent, and every type that has records has a valid and an
// invalid example in test/ledger/examples/ (S0-28 reuses them). The kernel
// resolves types only through the resolver a caller gives (KR-21): here, the
// sources themselves, as the ledger of `std` will hold them (S0-24).
import { describe, expect, it } from "vitest";
import { checkAgainstType, compare, hashRecord, isJsonObject, parseJson, rejectionsOf, ROOT, type JsonObject, type JsonValue, type ResolveType } from "../../src/kernel/index.js";
import { SESSION_TYPE } from "../../src/ledger/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { owned } from "../support/files.js";

const META = "core/type@1";
const SESSION = "core/session@1";

/** The types of S0 by TY-Z02…TY-Z05 and the scope of S0-08; the rest of `std` is S0-09. */
const S0_TYPES = [
  ...["act", "alias", "behaviour", "clause", "code", "composition", "contract", "decision", "decision-point", "domain", "example", "fact"],
  ...["hint", "implementation", "invariant", "judge", "knowledge", "namespace-policy", "port", "prose", "quality-profile", "requirement", "retired"],
  ...["scenario", "section", "setup", "stage", "term", "test-set", "valid-period"],
];

const BASES = ["behaviour", "composition", "contract", "decision-point", "hint", "implementation", "knowledge"];

/** TY-16: the base edge labels of `std`. */
const LABELS = ["about", "caused-by", "decides", "derived-from", "implements", "measures", "part-of", "supersedes", "uses", "verifies"];

function json(path: string): JsonValue {
  const parsed = parseJson(owned.text(path));
  if (!parsed.ok) throw new Error(`bug: ${path} is no JSON the kernel parses`);
  return parsed.value;
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

const nonAbstract = () => S0_TYPES.filter((slug) => body(slug).abstract === false);

describe("the sources of the types of S0 (S0-08)", () => {
  it("TY-01, TY-02: std/source holds one type body per file, named by its slug — exactly the types of S0", () => {
    expect([...std().bodies.keys()].sort()).toEqual(S0_TYPES);
  });

  it("TY-01, KR-14, KR-15, KR-18, KR-19: every source passes the check of the kernel as a record of core/type@1", () => {
    const refused = S0_TYPES.map((slug) => [slug, check({ type: META, rev: 1, body: body(slug) })] as const).filter(([, r]) => r.length > 0);
    expect(refused).toEqual([]);
  });

  it("KR-15: every chain of extends narrows its parent or keeps it", () => {
    const relations = S0_TYPES.flatMap((slug) => {
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
    for (const slug of S0_TYPES) {
      const orders = [slug, ...parentsOf(slug)].flatMap((s) => card(s).map(([o]) => o));
      expect([slug, new Set(orders).size]).toEqual([slug, card(slug).length]);
    }
    const cards = ["requirement", "scenario", "decision", "invariant", "term", "clause", "prose", "example"].map((s) => [s, card(s).map(([, n]) => n)]);
    expect(cards).toEqual([
      ["requirement", ["title", "statement"]],
      ["scenario", ["title", "when", "then"]],
      ["decision", ["title", "choice"]],
      ["invariant", ["title", "statement"]],
      ["term", ["term", "definition"]],
      ["clause", ["cells"]],
      ["prose", ["text"]],
      ["example", ["text"]],
    ]);
  });
});

describe("the base types and what extends them", () => {
  it("TY-03, G-02: each base type is an abstract root entity type with an optional supersedes of pinned references, label supersedes", () => {
    for (const base of BASES) {
      expect([base, body(base).extends, body(base).abstract, body(base).kind, required(base)]).toEqual([base, undefined, true, "entity", base === "implementation" ? ["contract", "code"] : []]);
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
    expect(entities.map((slug) => [slug, parentsOf(slug).at(-1)]).filter(([, root]) => root === undefined || !BASES.includes(root))).toEqual([]);
    expect(entities.filter((slug) => fieldsOf(slug).supersedes === undefined)).toEqual([]);
  });

  it("TY-05, GL-01: domain and section extend composition; the content blocks are the knowledge and composition types", () => {
    const content = nonAbstract().filter((slug) => parentsOf(slug).some((p) => p === "knowledge" || p === "composition"));
    expect(content).toEqual(["clause", "decision", "domain", "example", "invariant", "prose", "requirement", "scenario", "section", "term"]);
    expect([parentsOf("domain"), parentsOf("section")]).toEqual([["composition"], ["composition"]]);
    expect(required("section")).toEqual(["heading", "level", "items"]);
    const branches = list(object(field("section", "items").items).oneOf).map((b) => Object.keys(object(object(b).properties)));
    expect(branches).toEqual([
      ["item", "ref"],
      ["item", "header"],
    ]);
  });

  it("G-01: refs sit on the base knowledge, table and list on clause, prose and example", () => {
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

  it("TY-11, TY-12: code is the abstract shape {module, hash}; an implementation holds a contract, label implements, and code; judge adds model", () => {
    expect([body("code").abstract, required("code")]).toEqual([true, ["module", "hash"]]);
    expect([field("implementation", "contract").ref, field("implementation", "code").$ref]).toEqual([{ to: "std/contract@1", pin: "pinned", label: "implements" }, "std/code@1"]);
    expect([parentsOf("judge"), required("judge"), field("judge", "contract").ref]).toEqual([
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
    S0_TYPES.forEach((slug) => walk(schemaOf(slug)));
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
