# 01. Principles

PR-Z01. The principles every other document applies. A rule elsewhere that contradicts one of them is a defect of that rule.

## Substrate

| ID | Principle |
|---|---|
| PR-01 | **One substrate, many types.** Every record has one envelope, one identity model, one hash and one reference form (KR-04…KR-25). Types keep their own meaning: a requirement, an invariant, a contract and a pipeline are different types and are never merged into a universal object. |
| PR-02 | **One write path.** Knowledge changes only through a proposal that landing applies to the ledger (LG-22). This holds for every type: requirements, contracts, types, pipelines, policies. Apply changes knowledge; the runtime executes behaviour; recording keeps what happened. They are three mechanisms, never one. |
| PR-03 | **Mechanism closure.** A larger system adds data — types, blocks, contracts, implementations, pipelines, runs — never mechanisms. The mechanisms are listed in RM-Z04; a new one is a change of this design with its own rule ID, never an extension made inside a project. These sets are closed and grow only with a LATTICE version: the schema subset and annotations (KR-18, KR-19), status facts (TY-14), bases (TR-19), operation classes (RT-08), pipeline actions (RT-04), point policy operators (DP-13), metrics (BN-07) and checks (GL-08). |
| PR-04 | **Projection, not duplication.** Indexes, graphs, views and statuses are computed from the ledger and can be dropped and rebuilt (LG-34). Nothing computed is a second source of truth. |
| PR-05 | **Everything is linked.** Every record is reachable by references from a reason — a requirement or a finding — and every trace step from its session (OB-01). A record without such a path is an orphan and raises a signal or a finding. |

## Behaviour

| ID | Principle |
|---|---|
| PR-06 | **Govern the boundary, not the body.** LATTICE governs a contract: what goes in and out, which ports are reached, how it is recorded, how it is admitted. The body of an implementation is ordinary code: functions, modules, libraries, data structures. |
| PR-07 | **Govern the smallest useful boundary.** A contract exists when at least one holds: the code reaches the outside world; it has or will have more than one implementation; it is developed or checked separately; it changes at a different rhythm than its neighbours; it separates a model's judgement from deterministic code. Otherwise it is an ordinary function inside an implementation. |
| PR-08 | **Contract first, compose late.** A contract is admitted before its implementations and tests; implementations and tests are then written in parallel; a pipeline composes them when they exist. Composition is only a pipeline (RT-01). |
| PR-09 | **Agent proposes, runtime proves.** A fact that execution can establish is established by execution: a schema holds, a contract is met, tests pass, a hash matches, a pipeline is valid, a gate passes. A model chooses, writes and summarises; it never asserts such a fact. |
| PR-10 | **Record once.** Recording, evidence and provenance are functions of the platform (RT-22). An implementation never builds its own trace, cache or result envelope. |
| PR-11 | **Failure is input.** A failed run is recorded like any other (RT-15). Its record says what failed, at which boundary, under which contract and with which evidence; the next step is a proposal built from it, never a blind retry. |
| PR-12 | **Reuse before create.** Before a new contract, implementation or block is proposed, `solve` is asked for existing ones (LN-01). Then an ordinary function, then a new contract. |

## Projects and language

| ID | Principle |
|---|---|
| PR-13 | **Projects never blur.** One project has one ledger. Projects share code and knowledge only through libraries (LG-44); a project never writes into another and never references one it has not declared. |
| PR-14 | **One corpus language.** Knowledge blocks are written in English, one language without mixing, because search and judgement read them. Text that never returns into the system and that `solve` never reads — messages, reports, translations for a human reader — may be in the reader's language (TR-40). |

## Change units

| ID | Rule |
|---|---|
| PR-15 | A **change unit** is one proposal: the smallest set of intents that can be authored, checked and admitted alone. One change unit is one change request. It is a working term, not a record type: it has no id, registry or lifecycle of its own. |
| PR-16 | A part of the work is independent when it has its own contract, its implementation can change without changing its neighbours, its dependencies are minimal, and it can be admitted as a separate proposal. If one of these fails, the cause of the coupling is found before the work is split. |
| PR-17 | Not parallel: a step that needs a mechanism from an earlier slice, and two change units that change the same contract. One contract revision is admitted first; implementation work splits after it. |
| PR-18 | Parallel change units integrate optimistically. Each proposal names the tail it was built on; when another lands first, the later one is rebuilt from its proposal on the new tail (LG-24). A conflict is a normal step of integration, not an error. Parallelism comes from contracts, proposals and this compare-and-swap; there is no task graph, scheduler or merge mechanism. |

## Order of work

PR-Z02. The order in which a change moves from intent to running behaviour:

| Step | What happens | Output |
|---|---|---|
| 1 Understand | the intent is stated as a requirement and scenarios | `requirement`, `scenario` |
| 2 Search | `solve` finds existing contracts, implementations and knowledge (PR-12) | a context package |
| 3 Decompose | the change is split into independent units (PR-16); seams become contracts; choices become decisions; properties become invariants | `contract`, `decision`, `invariant` |
| 4 Admit design | the design proposal lands | admitted contracts |
| 5 Build | implementations and test sets are written in parallel against the admitted contract | `implementation`, `test-set` |
| 6 Compose | a pipeline composes stages; `setup` binds implementations | `pipeline`, `setup` |
| 7 Measure | the pipeline runs on its bench set; the gate admits it | report, `live` fact |
| 8 Run | runs are executed and recorded | run records |
| 9 Learn | signals and findings become the next requirement or proposal | the next change |

## Roles

| ID | Rule |
|---|---|
| PR-19 | Default roles. A namespace policy may change which types each role writes (TR-08); the separation of Implementer and Verifier is the default because a test written by the author of the code proves less. |
| PR-20 | In `runtime` every role writes by default its own `session`, `step` and `link` events, `code-commit` events, and the records of the runs its sessions execute: their tape entries (RT-23), `run`, `question`, `delivery-intent`. `delivery-attempt` and `act` are written by the roles PR-Z03 names. The admission of `runtime` records checks these rights (LG-52, TR-08). |

PR-Z03. The default roles:

| Role | Does | Writes | Never |
|---|---|---|---|
| Architect | understands, searches, decomposes, defines contracts, composes | `requirement`, `scenario`, `decision`, `invariant`, `contract`, `pipeline` | writes implementations |
| Implementer | implements an admitted contract in ordinary code | `implementation`, `review-note` | changes a contract; an insufficient contract is reported as a `review-note` on it |
| Verifier | writes tests and bench sets from the contract and scenarios | `test-set`, `bench-item` | reads the implementation while writing its tests |
| Reviewer | reviews changes and audits the design | `review-note` | fixes what it reviews |
| Curator | keeps knowledge clean: terms, duplicates, retirements, the queue of findings | `term`, drafts of `alias` and `retired` | makes design decisions |
| Runner | a machine: runs `std/verify`, the bench whose runs admission counts and the shadow runs whose disagreement is checked (TR-43, DP-22) | runs, `report`, files in `store/evidence/` | authors any other knowledge |
| Caller | a program, a person or an agent host on the public API (AG-06): starts agent sessions, fans out runs, delivers intents, continues after an escalation (AG-05) | `delivery-attempt` and `act` in `runtime`; for an import, `source-listing` and the types it imports (TR-39) | holds a policy of its own (AG-12) |
| Owner | a human: acts, `live`, retirement, policy | acts and status facts | — |
