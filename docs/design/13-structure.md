# 13. Structure

ST-Z01. Where code may live, what it may import, which tests keep the split honest, how quality is measured and how the architecture is kept from decaying. The rules of 02–12 say what the system does; this document says where its code goes.

## Modules

| ID | Rule |
|---|---|
| ST-01 | Modules and what each may import; a change to this matrix is a change of the design: |

| Module | Holds | May import |
|---|---|---|
| `kernel` | Record, Canon, Type, Schema, Ref (02) | — |
| `trust` | namespace policy, certificates and signatures, bases, in force, standing, facts, verdicts — pure rules over records | `kernel` |
| `evidence` | the formats of the run record and the tape: `encode`, `decode` with its check of signatures, `compareTuples` (LG-32) | `kernel` |
| `measure` | policy evaluation, bench metrics over decoded runs, targets | `kernel`, `evidence` |
| `ledger` | commits, apply and its phases with admission, fold and read views of both ledgers, the checks of findings and signals, landing, evolution classes, libraries, the live closure guard, the tuple of a pair and the authority of a run (DP-21); the interfaces of the `store`, `acts`, `git`, `clock` and `ids` ports | `kernel`, `trust`, `measure`, `evidence` |
| `codec` | `md` import and export | `kernel`, `ledger` |
| `generate` | TS types and validators from types (ST-08); linter configuration from the quality profile (ST-09) | `kernel` |
| `runtime` | pipelines, runs, recording, delivery intents, validation of pipelines (RT-33), the interfaces of every runtime port except `clock` and `ids`, which it takes from `ledger` — `forge` and the executor included | `kernel`, `evidence`, `ledger` (read view, `runtime` append, tape lookup) |
| `capabilities` | the `std` implementations of stage contracts: `decide`, `lens.candidates`, `lens.expand`, the stage of `verify`, … | `kernel`, `measure`, `runtime` port interfaces, `ledger` read view |
| `adapters` | one module per adapter; vendor SDKs live only here | the port interface it implements |
| `assembly` | builds the runtime and landing from configuration; reads `$env` | everything above |
| `cli` | commands (RT-32) | `assembly` |

| ID | Rule |
|---|---|
| ST-02 | No new module, layer or port without a second real adapter or a rule ID that needs it. A hypothetical seam is a defect. |
| ST-03 | Records are frozen plain data and pure functions; there is no class per record type. Code and rules use only the terms of LATTICE (00). |
| ST-04 | A structure test checks the imports of `src/` against ST-01: direction, no cycles, adapters never import each other, a vendor SDK only inside its adapter, the `judge` port only in `decide`, no import of another project's code except a pinned library (PR-13). Outside `adapters`, `assembly` and `cli` the code is pure: no clock, randomness, environment, network or file access. Landing is pure in this sense: it reaches git, acts, the store, time and ids only through ports (LG-23). |
| ST-05 | Everything reachable from the kernel entry is on an explicit list of files, and all of it is pure; a file added to that reach without the list fails the test. A test fails if a `std` type name appears in kernel code (KR-01). |
| ST-06 | Only `assembly` imports adapters. Only `assembly` and `cli` import `codec` and `generate`. |
| ST-07 | One set of contract tests per port runs against every adapter and every recording mode. Fixtures are keyed by meaning — the request's operation and content — never by a prompt hash. Deterministic adapters exist for tests: `clock-fixed`, `ids-counter`. |
| ST-08 | TS types and validators are generated from types into `gen/`, which git ignores; `export` writes them on demand from the tail or from the `after` of a dry run, and they are never edited by hand. Implementations and test sets import them; the code hash excludes them (RT-12). CI generates them before the type check. |
| ST-18 | At run time a test reads only the files its test set owns (ST-10), `knowledge` (LG-01) and what it has written itself in that run; the only programs it starts are programs of its project, run as the code under test, and the tools its environment names. A structure test checks it on every change request (ST-12). |

## Quality

| ID | Rule |
|---|---|
| ST-09 | A **quality profile** is a behaviour block referenced by the namespace policy: limits of cyclomatic complexity per function, function length, nesting depth, parameters, file length, and the purity rules. The linter configuration is generated from it into `gen/`. A namespace may hold several profiles; raising a limit is a new revision with an owner act. |
| ST-10 | From the switch on, every file under `src/` and `test/` belongs to the module of an `implementation` or a `test-set`. A file without an owner fails the fitness tests. |
| ST-11 | An implementation contains domain computation, parsing, transformation, reads through its ports, validation intrinsic to its computation, and the prompts it builds for an `llm` operation. It never re-implements reference resolution, policy evaluation, ledger semantics, judging, recording or the gate; it never writes to the ledger; it never keeps its own registry, index, cache, memo or trace; it returns only a stage outcome — a status and the fields it wrote — never a universal result. Its private functions are ordinary code and return what they like. |
| ST-12 | **Fitness tests** run on every change request: the structure test (ST-04…ST-06, ST-18), the type check, the quality profile, file ownership (ST-10), the fixtures of every rule ID that a hard check enforces (ST-17), and equality of `docs/` with what the ledger generates. |
| ST-17 | A **hard check** is code that refuses an input — a write, a git commit or change request, evidence, the opening of a store or a library, a pipeline, a start-up, a stage, a run or a delivery — because a rule does not hold. Hard checks run in apply (LG-16), the admission of `runtime` records (LG-52), the secret guard (LG-20), the opening of a store and `sync` (LG-05, LG-27, LG-48), the loading of a library (LG-44, LG-48), `import-md` (LG-42), `decode` (LG-32), pipeline validation (RT-02…RT-05, RT-09, RT-33), start-up (RT-12, RT-13), a run and its replay (RT-03, RT-16, RT-19, RT-28, RT-29, DP-05), CI and the commit hook (LG-51, OB-07), and the caller before a delivery and in its answers to permission requests (RT-26, RT-28, AG-08). Its refusal names the rule ID it enforces; a hard check without one is a defect of the design. Every rule ID a hard check enforces has a fixture that triggers it and one that passes it; those of the caller live in its package (AG-13). |
| ST-13 | Of ST-11, what code can check is checked: imports, the `judge` port, writes to the ledger, the subset of `writes` (RT-03). The rest — "does not re-implement", "keeps no cache" — is a review boundary until an audit finding turns it into a fitness test (ST-16). So is the rule that a record written from a run cites that run (TR-21). The marking of fields (RT-33) is checked by pipeline validation. |

## Audit

| ID | Rule |
|---|---|
| ST-14 | Four levels keep the architecture from decaying: fitness tests on every change request; a review of every change request by the Reviewer against the design; an **architecture audit** of the whole code at the end of each slice and on a trigger (ST-15); refactor change units after an audit, which change no behaviour and keep tests green. |
| ST-15 | Audit triggers outside the end of a slice: a change of a file the walking skeleton owns (SL-05), a new module or port, a change unit touching three modules or more, and the switch. |
| ST-16 | **Ratchet**: an accepted audit finding that code can check becomes a fitness test, so it cannot regress; any other becomes a rule with an ID. Findings are sorted by strength: strong — a refactor in the next slice; worth exploring — a requirement; speculative — an item of 15. |

## Methodology

ST-Z02. How familiar practices map onto LATTICE; the names on the left are analogies, never terms of the code:

| Practice | In LATTICE |
|---|---|
| domain-driven design | the shared language is `term` blocks; a context is a namespace with its domains; a context map is the graph of libraries. Entities, aggregates and repositories as classes are not used (ST-03). |
| behaviour-driven development | `scenario` blocks (given, when, then) under a requirement; a `test-set` covers them. |
| test-driven development | contract → `test-set` → implementation; tests exist before the code. |
| hexagonal architecture | ports are contracts; adapters are their implementations; the core is pure. |
| vertical slices | slices (14) and change units (PR-15). |
| clean code | the quality profile, pure functions, frozen data. |
