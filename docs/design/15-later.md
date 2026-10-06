# 15. Later and not taken

LT-Z01. What is deliberately not in the design yet, and what is never taken. A deferred item returns only when its trigger fires, through the document it touches. A rejected item is proposed again only with a new argument against its reason.

## Later

| ID | What | Trigger |
|---|---|---|
| LT-01 | Mechanics of a kernel transition commit (LG-49); until it exists a store under a new kernel is read-only. | the first kernel change after the switch |
| LT-02 | A contract test that `std` applies cleanly on every kernel version. | the first kernel change after the switch |
| LT-03 | Owner queue: open findings per rule ID and the age of the oldest, at most 10 shown. | the first findings in S1 |
| LT-04 | The author's own verdict on their block does not count. | the first verdicts |
| LT-05 | A finding when an entity is retired while its votes for reach a threshold. | the first verdicts |
| LT-06 | A second annotator on 20% of bench items. | the first bench set |
| LT-07 | Classification of empty outcomes: search miss, real gap, gap in the source. | S1 |
| LT-08 | Memo per candidate for a `score` point, so a changed pool re-scores only new candidates. | the cost of S2 |
| LT-09 | `state` sent once as a stable prefix for a vendor's prompt cache. | S2 |
| LT-10 | Consistency of runs on the same input, not only across variants. | S2 |
| LT-11 | Compatibility of context field types between stages, by `extends`. | S2 |
| LT-12 | Import items carry a stable anchor in their source and a hash of their full text. | S4 |
| LT-13 | Expiry of `runtime` records by an explicit command with its epoch; a pinned reference into expired records resolves to `expired`. | the first expiry |
| LT-14 | A store metric: p95 of opening a store, its fold from genesis included. | when a store needs a measurement |
| LT-15 | The `container` executor (RT-31). | the first implementation that needs isolation beyond a process |
| LT-16 | A second implementation of `lens.candidates` on local embeddings (LN-08). Its index is an outside materialisation fed by the ledger feed (LG-41), reached through a port whose answer names the `seq` the index was built to; the stage records its lag to the knowledge commit of the run. | the bench shows a pool recall gap |
| LT-17 | A numeric trust score. | the bench shows it improves selection |
| LT-18 | Consumer cues: phrasings that boost a block. | the bench shows a recall gap |
| LT-19 | A shared helper library for the repeated pattern "read a block, transform, write a field". | the third implementation that repeats it |
| LT-20 | A cost gate: a target per cost metric of a pipeline, read from the tape. | the first pipeline whose cost per run is material |
| LT-21 | Throughput: p95 of runs per day and tape size per run. | a run volume that makes the cost of a run material |
| LT-22 | A factory pipeline that runs agents as stages, with the ports and effects it needs. | the first factory step that the caller cannot run as a session |
| LT-23 | An index for BM25 over cards (LN-04), with the tokenizer staying code of the implementation. | the time per accepted result of `solve` on the bench exceeds its target |
| LT-24 | Findings kept as rows of the fold instead of computed on demand (TR-35). | the time of a `findings` query slows landing or the owner queue |
| LT-25 | Checks of findings declared by a project. | the first project whose needs the closed set of checks does not cover |
| LT-26 | Runs over a speculative view — the tail with the candidate commit of a proposal — so a feature is benched before it lands. | the time from a contract's admission to its `live` pipeline is dominated by the number of landings |
| LT-27 | The `llm` port only for `std` capabilities `generate` and `extract`, with prompts as data, as the `judge` port only for `decide`. | an audit finds an implementation that branches on model output |
| LT-28 | An answer of a `read` operation given by reference to an immutable snapshot with its hash; replay needs the snapshot. | the first `read` answer above 1 MiB, or the first source with personal data |
| LT-29 | A scheduled re-run of a sample of `holdout` for every live pipeline with a judge, compared as a regression (BN-16), to catch drift of a vendor's model. | the first live pipeline with a judge of an outside vendor |
| LT-30 | Metrics declared by a project. | the first project whose targets the closed set of metrics does not cover |

## Not taken

| ID | What | Why not |
|---|---|---|
| NX-01 | A universal object or result type (`Decision`, `Operation`, `Result {value, evidence, …}`). | Types keep their meaning (PR-01); a stage returns a stage outcome (ST-11). |
| NX-02 | A second composition mechanism: stage graph, DAG of pipelines, composite capability, workflow engine. | Composition is only a linear pipeline (RT-05); fan-out belongs to the caller. |
| NX-03 | Suspended runs, waiting state, resume commands. | The runtime keeps no waiting state (RT-18). |
| NX-04 | A rule language, decorators, a YAML or descriptor language. | Machine formats are JSON blocks; data of a block is not a language. |
| NX-05 | A registry, catalogue or index kept by an implementation. | Identity is `id@n`; indexes are projections (PR-04). |
| NX-06 | A cache, memo or trace inside an implementation. | Recording and memoization are the platform's (RT-22…RT-24). |
| NX-07 | Numeric trust: weights, independence groups, decay. | Trust is basis, in force and counts (TR-33). |
| NX-08 | Verdicts that change knowledge automatically. | Counts change nothing by themselves (TR-33). |
| NX-09 | Fusing ranks from several sources (RRF, scorers, boosts). | One path of scoring: pool, then judge (LN-08). |
| NX-10 | A registry of actors, OS users or environment variables as identity. | Identity is the policy's writers and keys (TR-09, TR-10). |
| NX-11 | A stored value kind, payloads or snapshots. | Content-addressed things are computed (RF-10). |
| NX-12 | Pipelines and ports in a namespace body; hot reload; JSON5. | Policy and behaviour stay apart (TR-02, RT-10). |
| NX-13 | An index of executions read by `knowledge` checks. | `runtime` has no weight until cited (LG-31). |
| NX-14 | A commit idempotency key as a separate field. | The proposal hash deduplicates (LG-12). |
| NX-15 | Temporal semantics in the kernel. | The kernel knows only author time; valid time is data (KR-09, LG-41). |
| NX-16 | Writing a `knowledge` commit to `postgres` before git, or through an outbox. | Git decides the order of `knowledge`; a store that cannot roll back never goes first (LG-22, LG-27). |
| NX-17 | Projections of a domain inside LATTICE. | Domain views consume the feed (LG-41). |
| NX-18 | Agent frameworks with their own workflows as a mechanism of LATTICE. | Their loops, branches and waiting duplicate the pipeline and the caller; a model SDK is only an adapter (RT-30). |
| NX-19 | A second language in the corpus. | Search and judgement read one language (PR-14). |
| NX-20 | The meaning of a projection written per store adapter or in SQL. | Fold is one function; adapters keep its rows (LG-35, LG-02). |
| NX-21 | Landing as a pipeline run. | The runtime imports the ledger; what landing reads is kept as `act` events in the commit (RT-32, TR-16). |
| NX-22 | A `machine` participant that acts by delegation. | Delegation is a rule of admission over evidence (TR-18). |
| NX-23 | Signals that turn into findings by themselves. | A signal never has weight; a finding has its own check, which may read cited evidence (OB-12). |
| NX-24 | Memo keys of particular ports written into recording code. | The memo key is data of the port (TY-10, RT-24). |
| NX-25 | A `live` fact for a `setup` alone. | The pair of a pipeline's `live` fact drives execution (DP-21). |
| NX-26 | A judge call shared by several points. | Its answer would depend on the batch, which no memo key holds (DP-12). |
| NX-27 | Steps that copy a run, a delivery attempt or an act. | A record is its own step in the trace view (OB-02). |
