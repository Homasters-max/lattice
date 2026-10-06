# 10. Bench

BN-Z01. How to prove that something got better: quality of any pipeline and calibration of decision points, measured on sets that people wrote. A bench measures how well; a `test-set` checks whether a contract is met. They never merge.

## Sets

| ID | Rule |
|---|---|
| BN-01 | A **bench item** is a `bench-item` block with basis `asserted`: an input (a need, a point `state`, or any pipeline input) and an expected answer (pinned references compared by `id`, or a value). Kinds: `normal`; `trap` — shares at most 15% of its words with the text of its expected block; `blank` — near the topic, with no answer in the scope. A set for a search or a point holds at least 10 `trap` and 10 `blank` items. |
| BN-02 | A **bench set** is a composition of pinned references to items. A new revision of a set needs an owner act. |
| BN-03 | An item may carry `variants`: paraphrases and translations of its input with the same expected answer. |
| BN-04 | A set is split into `tune` (thresholds are chosen on it) and `holdout` (the move to `live` is checked on it), deterministically by the hash of the item `id` and the `salt` of the set. The salt is a field of the set; it changes only on rotation, which is a new set revision with a new salt. Tuning reports never show `holdout` numbers. |
| BN-05 | Items come from real work — tasks, change requests, a consumer's work — never from retelling the documents. Expected answers are fixed in the ledger before any run on the set, and never come from a judge or a model. |
| BN-06 | The trace drafts items: a need sent to `solve` and the blocks the agent then actually opened (OB-04) become a draft with basis `inferred`. A human act on a batch of drafts makes them `asserted`. Drafted items, and items grown from escalations and `shadow` disagreements, go only to `tune`; `holdout` is written by people. |

## Metrics

| ID | Rule |
|---|---|
| BN-07 | Metrics are a closed set in `measure`: `hit@k`, MRR, pool recall, precision and recall of refusal on `blank` items, exact match, share of outputs valid by schema, cost and time per accepted result (from the tape), consistency across `variants`. A pipeline declares which it is measured on by its `targets`. Every metric is broken down by kind of block or input. `measure` computes them from decoded runs (LG-32) and bench items. |
| BN-08 | Consistency is the share of `variants` that give the same answer as the main input. |
| BN-09 | Baselines are pipeline revisions, never settings: for `solve` — BM25 without a judge, BM25 over whole documents, full text instead of the card. |
| BN-10 | The caller runs the pipeline under test once per input of a split — items and variants — in a runner session with purpose `bench` (TR-43) and cites the runs; the store command `report` drafts the report. In CI the bench runs on `fixture` and `recorded` adapters and never calls a live judge; a report that the gate or a calibration counts is produced on `service` adapters (DP-24, DP-25). |
| BN-11 | A **report** is a fact of type `report` keyed by subject `ref@n`, `set@n` and split. Its value is references to the cited runs, label `measures` (TR-21), and the hash of their execution tuple; its metrics are computed by `measure` and never stored. It is written by a runner session with purpose `bench` and has basis `observed` once acted on, usually by the act that covers its proposal (TR-15, TR-20). A second report with the same key is rejected: a new measurement needs a new revision of the subject or of the set. |

## Targets and gates

| ID | Rule |
|---|---|
| BN-12 | Targets are data: a pipeline has `targets` per metric; a point has a precision target and a consistency target; both have a regression tolerance no smaller than measured noise. Defaults: precision and recall of refusal at least 0.8; no kind of block below its baseline. |
| BN-13 | Admission (LG-21) admits a report only if its cited runs cover exactly the inputs of its split — one run per item and variant, matched by input fingerprint — are counted (TR-43), and share one `pipeline@n`, one execution tuple by `compareTuples` (LG-32), whose hash the report holds, and one knowledge commit; a failed run counts as a miss and is never dropped. |
| BN-14 | Minimum size in `holdout`: 30 per answer value for a point, 30 items for a pipeline. Below it the report says `insufficient-data` and the move to `live` is impossible. The minimums of BN-01 and of this rule are constants of the gate code; targets may raise them, never lower them. |
| BN-15 | A comparison decides by the lower bound of a paired bootstrap of the difference — 95%, fixed seed. Noise is measured by repeated runs with memoization off. |
| BN-16 | The reports of a new revision and of the current `live` one on the same set and split are compared: the overall difference and the items that got worse. A regression beyond tolerance is a finding. Reports are comparable only when `compareTuples` finds the same execution tuple except the revision under test, with the same knowledge commit and the same environment; otherwise the comparison is `invalid`. |
| BN-17 | A report counts for the gate only if its targets were in force at the knowledge commit its runs read: a target lowered after seeing `holdout` numbers never admits that report. |
