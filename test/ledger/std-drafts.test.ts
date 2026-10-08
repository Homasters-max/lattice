// The drafts of S0-09 (TY-02, TY-14): the rest of the types of std the design
// names, checked by the kernel before it freezes as `1` (SL-03, KR-03), and the
// examples of the design read from docs/design as they are. What the subset of
// KR-18 does not say is in plan/phases/S0-kernel-ledger/std-schema-gaps.md.
import { describe, expect, it } from "vitest";
import { validate, type JsonObject, type JsonValue } from "../../src/kernel/index.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { knowledge } from "../support/files.js";
import { body, branchesOf, check, FACTS, field, fieldsOf, frozen, keysOf, list, object, parentsOf, required, RUNTIME_EVENTS, schemaOf, STATUS_FACTS, std, STD_TYPES, without } from "./std-sources.js";

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

describe("the drafts of S0-09: facts", () => {
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
    expect(FACTS.filter((slug) => list(required(slug)).some((k) => typeof k !== "string" || !keysOf(slug).includes(k)))).toEqual([]);
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
});

describe("the drafts of S0-09: events", () => {
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
    expect([body("decision-result").abstract, branchesOf(union), reasonsOf(union)]).toEqual([
      true,
      ["selected", "none", "ambiguous", "insufficient", "unavailable"],
      [[], ["threshold"], ["margin"], ["budget", "no-candidates"], ["timeout", "network", "schema", "model", "coverage"]],
    ]);
  });
});

/** The reasons of each branch of a DecisionResult: its `const` or `enum`, none for `selected` (DP-08). */
function reasonsOf(union: JsonObject): JsonValue[][] {
  return list(union.oneOf).map((b) => {
    const reason = object(object(b).properties).reason;
    if (reason === undefined) return [];
    const { const: one, enum: many } = object(reason);
    return one === undefined ? [...list(many)] : [one];
  });
}

/** The schemas of the abstract types of std by pinned reference, for `validate` (KR-21). */
const schemas = (ref: string): JsonObject | null => {
  const slug = /^std\/(.+)@1$/.exec(ref)?.[1];
  return slug === undefined || !std().bodies.has(slug) ? null : schemaOf(slug);
};

/** The JSON of the fenced block `id` of a design file (RM-Z03): the examples of the design, as the design writes them. */
function designBlock(file: string, id: string): JsonObject {
  const text = knowledge.text(file).replaceAll("\r\n", "\n");
  const found = new RegExp("```json " + id + "\\n([\\s\\S]*?)\\n```").exec(text)?.[1];
  if (found === undefined) throw new Error(`bug: ${file} has no block ${id}`);
  return object(frozen(found, `${file} ${id}`));
}

/** A record the design writes with its header inline: its `type`, and the body without `type` and `id`. */
function recordOfDesign(example: JsonObject) {
  const type = example.type;
  if (typeof type !== "string") throw new Error("bug: a design example names no type");
  return { type, rev: 1, body: without(example, "type", "id") };
}

/** The alternatives a template of the design writes as `a | b | c`. */
function alternatives(value: JsonValue | undefined): string[] {
  if (typeof value !== "string") throw new Error("bug: a template names its alternatives in a string");
  return value.split(" | ");
}

/** DP-Z07 with each status of the draft, the first reason of its own set and its placeholders <ref@n> filled in. */
function filledDecisionResults(template: JsonObject, union: JsonObject): JsonObject[] {
  const ref = "acme/tool-a@1";
  const evaluation = object(list(template.evaluations)[0]);
  const base = {
    ...without(template, "reason"),
    selected: [ref],
    evaluations: [{ ...evaluation, candidate: ref, score_semantics: "preference" }],
    inputs: { ...object(template.inputs), point: "acme/pick-tool@1", candidates: [ref] },
  };
  return branchesOf(union).map((status, i) => {
    const [reason] = reasonsOf(union)[i] ?? [];
    return reason === undefined ? { ...base, status: status ?? null } : { ...base, status: status ?? null, reason };
  });
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

  it("DP-08: DP-Z07 names the statuses, the reasons and the score semantics of the draft of decision-result", () => {
    const template = designBlock("08-decision.md", "DP-Z07");
    const union = schemaOf("decision-result");
    const evaluation = object(list(template.evaluations)[0]);
    const semantics = object(object(object(object(object(list(union.oneOf)[0]).properties).evaluations).items).properties).score_semantics;
    expect([alternatives(template.status), alternatives(template.reason), alternatives(evaluation.score_semantics)]).toEqual([
      branchesOf(union),
      reasonsOf(union).flat(),
      object(semantics).enum,
    ]);
  });

  it("DP-08: each status of DP-Z07, filled in, is a valid DecisionResult", () => {
    const union = schemaOf("decision-result");
    const filled = filledDecisionResults(designBlock("08-decision.md", "DP-Z07"), union);
    expect(filled.map((v) => [v.status, validate(deepFreeze(v), union, schemas)])).toEqual(filled.map((v) => [v.status, { ok: true }]));
  });
});
