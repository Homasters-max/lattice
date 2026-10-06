# 08. Decision pattern

DP-Z01. Every place where the system needs a semantic judgement — which blocks, which tool, which model, is this a duplicate, is this enough — follows one execution pattern, not one engine:

```text DP-Z02
allowed set → candidate set → judge → policy → DecisionResult
```

DP-Z03. Code controls, the judge assesses, policy decides, a model writes. Semantic judgement becomes usable in program logic while behaviour stays deterministic, replayable and bounded.

DP-Z04. The steps:

| Step | Owner | Answers |
|---|---|---|
| Allowed set | declared by the point (DP-05) | what may be considered at all |
| Candidate set | the pool written by an earlier stage, checked against the allowed set | the exact list given to the judge |
| Judge | the `judge` port; `judge@n` pins its adapter and model (DP-10) | what can be said about each candidate |
| Policy | code of `measure`, parameters from the point | what is done with that assessment |
| DecisionResult | the stage outcome of `decide`, kept in the run record | what was decided |

## Model

```json DP-Z05
{ "type": "std/decision-point@1", "id": "acme/pick-tool",
  "candidates": { "source": "acme/tools.allowed@2", "required": [] },
  "question":   { "kind": "choice", "state": { "task": { "max": 4000 } },
                  "criteria": "Which tool best advances the task?" },
  "judge":      "acme/judge.jev@3",
  "policy":     { "op": "margin", "min": 0.2 },
  "bench":      "acme/pick-tool-set@4",
  "targets":    { "precision": 0.9 } }
```

| ID | Rule |
|---|---|
| DP-01 | A **decision point** is a block of type `decision-point`: an allowed set, a question, a pinned `judge@n`, a policy, a bench set and targets. `decide` is a `std` stage contract whose param is the point; it is the only stage whose implementation receives the `judge` port. |
| DP-02 | `question.kind` is `choice`, `score` or `binary`. Ranking is `score` with `score_semantics: preference` and `top-k` in the policy. |
| DP-03 | `state` holds only the fields the point declares, each checked by its type and length limit. |
| DP-04 | `required` candidates are always selected and never judged. The context budget (LN-02) is one run context field, taken from the need; it applies only to the other candidates, and no stage writes it. If the `required` candidates alone exceed it, the result is `insufficient` with reason `budget`; they are never dropped silently. |
| DP-05 | `candidates.source` declares the **allowed set**: a pinned reference to a set, or `scope`, the need's scope (LN-03). The pool is a run context field written by an earlier stage. `decide` rejects the run, naming this rule, if the pool holds a candidate outside the allowed set. |
| DP-06 | A `binary` question asks whether a candidate matches the criteria or a text, never whether a statement about the world is true. Truth comes from verdicts on outcomes. |
| DP-07 | Fallback, retries and widening a search are not part of a point: the point decides, the pipeline dispatches on its status. A decision of several steps is several points in a linear pipeline; a loop belongs to the caller. |

DP-Z06. Not decisions:

| Case | Where it lives |
|---|---|
| execution | a pipeline and its implementations |
| outcome | a verdict |
| calibration | the bench and verdicts (DP-25) |
| generation | an `llm` operation |
| search | a candidate source, such as `lens.candidates` |
| extraction ("take the amount from this email") | an `llm` operation whose value code checks against a schema; whether it matches the text is a separate `binary` point |

## Result

```json DP-Z07
{ "status": "selected | none | ambiguous | insufficient | unavailable",
  "reason": "threshold | margin | budget | no-candidates | timeout | network | schema | model | coverage",
  "selected": ["<ref@n>"],
  "evaluations": [{ "candidate": "<ref@n>", "value": "…", "score": 0.71,
                    "score_semantics": "relevance | confidence | preference" }],
  "inputs": { "point": "<ref@n>", "candidates": ["<ref@n>"], "input_fingerprint": "sha256:…" } }
```

| ID | Rule |
|---|---|
| DP-08 | A **DecisionResult** is the stage outcome of `decide`, kept only inside its run record. Statuses: `selected` — the policy selected at least one candidate; `none` — none passed; `ambiguous` — the top candidates are too close; `insufficient` — not enough candidates or budget; `unavailable` — the judge gave no valid answer. Escalation and refusal are pipeline actions, not statuses. `reason` is from a closed set per status: `none` — `threshold`; `ambiguous` — `margin`; `insufficient` — `budget`, `no-candidates`; `unavailable` — `timeout`, `network`, `schema`, `model`, `coverage` (DP-09); `selected` has none. |
| DP-09 | `unavailable` covers a timeout, a network error, an answer outside the schema, a model other than the pinned one, and an answer that does not cover exactly the candidate set. A contract test of every judge adapter checks the last case. |

## Judge

| ID | Rule |
|---|---|
| DP-10 | `judge@n` is a `judge` implementation (TY-12): it pins the adapter code — which holds the prompt, retries, backoff and batching — and the exact model id. Its request is `(question, judge@n, candidates with their cards, state)`; its answer is exactly one evaluation (`value`, `score`) per candidate and nothing else. Changing the model or the prompt is a new `judge@n`. An adapter that can read the model of an answer compares it with the pinned one; a mismatch is `unavailable`. The adapter reports the model id and the result of that comparison, and recording writes them with the answer (RT-23). |
| DP-11 | Two kinds of judge serve different points: a per-candidate scorer — such as Jev — for points over many candidates (`score`, `binary` per candidate); a language model for points that reason over a few candidates together, such as "is this context sufficient?". |
| DP-12 | Timeouts, retries with backoff and batching of candidates belong to the `service` adapter; the tape holds the final answer. A judge call serves one point. |

## Policy

| ID | Rule |
|---|---|
| DP-13 | Policy operators are a closed set: `threshold`, `top-k`, `margin`, `budget`, `any`, `all`, `table` (maps the selected value to an output value). With DP-04 and DP-08 they form one pure function of `measure`, **policy evaluation**: policy, evaluations, `required` and budget in; status, reason and `selected` out. `decide`, the gate and calibration call it. A new operator is code, never an expression in a block. Point policy is stateless: it never reads an earlier decision. |

## Boundaries

| ID | Rule |
|---|---|
| DP-14 | **Single channel.** Every semantic judgement goes through `decide`. Only the implementation of `decide` receives the `judge` port, checked by a structure test (ST-04). An `llm` operation only generates or extracts; no branch depends on its output (RT-09). |
| DP-15 | The judge never grants: it can narrow and flag, never permit. It never writes knowledge: its output stays on the tape, and a block written from it is a separate, acted intent. Policy never reasons. The allowed set never chooses. A decision is not an outcome. |
| DP-16 | Hard invariants — schemas, imports, hashes, boundaries — are checked only by code, all of them, always. A judge may find and explain a violation, never decide pass or fail. Every boundary named in criteria is checked by code or declared uncheckable and measured by a metric. |

## Scores

| ID | Rule |
|---|---|
| DP-17 | A score has declared semantics and is not a probability unless calibrated. On an uncalibrated score, policy may use only order operators (`top-k`, `margin`); an absolute threshold needs a calibration. In `shadow` and on the bench any operator may run; a calibration is gathered only from runs of `std/point-bench` (DP-25). |
| DP-18 | An uncalibrated `binary` point is only measured: a pipeline that pins it fails the gate, so it runs only in `shadow` or on the bench, and records written from its output are `inferred` (TR-20) and never in force. |

## Determinism

| ID | Rule |
|---|---|
| DP-19 | Replay (RT-16) reads recorded judge answers: the same candidates, question, answers and policy give the same decision. **Re-run** asks the judge again and is compared with the record. **Re-evaluation** applies another point policy to the recorded judge answers of a run, without calling the judge. |
| DP-20 | A judge call is memoized by the `memo` of `std/judge` (TY-10, RT-24); a new `judge@n` never hits an old memo. |

## Authority

| ID | Rule |
|---|---|
| DP-21 | A run is **authoritative** iff the `live` fact of its pipeline in force at the knowledge commit it read names its `pipeline@n` and `setup@m`, the tuple of that pair at that commit (LG-38) equals the `tuple` the fact holds, and every member of the closure of the pair is in use (DP-24). It is a pure function of the run record and the read view at that commit. Only an authoritative run drives execution. The output of any other run is marked `non-authoritative`. |
| DP-22 | **Shadow** is a pipeline revision that is not `live`, run beside the `live` one on the same input; the `live` one decides and is the baseline. Shadow and `live` runs whose disagreement is checked run in a runner session and are cited; the check "shadow disagreement" raises a finding over the counted runs of both (TR-35, TR-43). A pipeline without a `live` revision runs only on the bench. |
| DP-23 | A new `judge@n` reaches execution only through a new point revision, a calibration that applies to it and a new `live` pipeline revision. There is no automatic switch. A model retired by its vendor makes the point `unavailable` until the owner migrates it. |
| DP-24 | **Gate.** Admission (LG-21) admits a `live` fact `{pipeline@n, setup@m, tuple}` only if all hold: (0) every member of the closure of the pair — the contracts, points and `judge@n` the pipeline pins, its bench set, and the implementations and adapters the setup binds — is in force and in use, and every binding of the setup meets RT-11; (1) the cited evidence decodes (LG-32) and its runs are counted (TR-43); (2) the pipeline's `holdout` report is admitted (BN-13), and its metrics, computed by `measure` from the decoded runs, meet the pipeline's `targets`; (3) its runs used `setup@m`, and their tuple equals `tuple` and the tuple of the pair in `after` (LG-38); (4) every answer in the evidence has mode `service`, and every judge answer also the pinned `judge@n` and `check: verified` (RT-23); (5) every pinned point whose policy uses an absolute threshold or whose question is `binary` has a calibration in force that applies to it and meets its targets; (6) no regression finding (BN-16) is open without `dismissed`; (7) the contracts the pipeline pins have no open traceability gap (TR-36). Conditions (6) and (7) ask `findings` of the view `after` (TR-35). The gate never calls a judge. The `live` fact still needs the owner's act. |
| DP-30 | **Live closure guard.** Apply rejects a commit that takes a member of the closure of a `live` pair out of use, or changes the tuple of a `live` pair through new pins (LG-46), unless the same commit revokes that `live` fact or gives it a new value that the gate admits. |

## Calibration

| ID | Rule |
|---|---|
| DP-25 | A **calibration** binds to `question`, `judge@n` and the bench set revision the point pins. It is a `calibration` fact whose value references the `holdout` report (TR-29). It applies to a point revision iff that revision has the same question, judge and set; changing the policy needs no new calibration, because the gate recomputes the report under the revision's policy. Admission (LG-21) admits a calibration fact only if its report is the admitted `holdout` report (BN-13) of the point's set, its runs were runs of `std/point-bench` (DP-31) with the point's question and `judge@n`, every answer of those runs has mode `service` and every judge answer `check: verified`, as DP-24 (4) requires, the split has the minimum size (BN-14), and the measures of DP-26 meet the point's targets (DP-27). |
| DP-26 | Calibration measures, on the `holdout` report: precision in the **sure band** — items whose status is `selected` — per answer value; the share of the **grey zone** — items `ambiguous` or `insufficient`; the size of the set. |
| DP-27 | The precision target is data of the point. A calibration takes effect only by the owner's act. Verdicts that count are acts of people and deterministic checks; a verdict of a model or a judge never counts. |
| DP-28 | A calibration goes stale when what the judge reads changes without a new point revision — a type in the allowed set changes its card. That raises the finding "stale calibration"; the calibration stays in force until the owner acts. |
| DP-31 | `std/point-bench` is the `std` pipeline that measures a point: input `{point, state, pool}` and one `decide` stage. It is the only pipeline whose `decide` takes its point from run input, an exception to RT-02, and it has no bench set or targets of its own. The report of a point has subject `point@n` and the set the point pins. |

## Language

| ID | Rule |
|---|---|
| DP-29 | Criteria and cards are in the corpus language (PR-14). Input in another language is translated by a recorded stage before the point; its output is part of the input fingerprint. Whether answers agree across languages is measured on the bench (BN-08). |

## Cases

DP-Z08. Internal cases:

| Case | Candidates | Judge | Policy |
|---|---|---|---|
| block ranking | the pool of `lens.candidates` | scorer, `score` | `top-k` + `budget` |
| context sufficiency | the selected blocks as one composite candidate | model, `binary` | `threshold` after calibration |
| tool | the allowed tools | `choice` | `margin` |
| model by complexity | complexity levels, not models | `choice` | `table`: level → model |
| duplicates | card pairs chosen by code | scorer, `score` | `threshold` → alias candidate |
| scenario coverage | pairs test ↔ scenario | `binary` | reports in `shadow` until calibrated |
| change against invariants | invariants found by referrers | `binary` each | `any` |
