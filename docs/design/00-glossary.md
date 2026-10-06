# 00. Glossary

GL-Z01. One term, one definition. A term that a rule defines points to that rule. A term without a rule is defined here. A new term enters the design in the same change as its definition.

GL-Z02. Terms defined by rules:

| Term | Defined by |
|---|---|
| record, entity, event, kind | KR-04, KR-05 |
| revision, current revision, latest revision | KR-05, TR-22 |
| kernel version | KR-03 |
| type, meta-type, abstract type | KR-14, KR-16 |
| base type | TY-03 |
| schema subset, annotation | KR-18, KR-19 |
| `compare` | KR-22 |
| canonical form, hash | KR-10, KR-12 |
| author time, transaction time, valid time | KR-09 |
| reference, floating, pinned, fragment | KR-23 |
| visible set | RF-01 |
| external link | RF-06 |
| edge label | RF-07, TY-16 |
| referrers | RF-09 |
| card | RF-10 |
| orphan | RF-11 |
| contract, stage, port | TY-06, TY-07 |
| implementation, capability, adapter | TY-11 |
| `memo` of an operation | TY-10 |
| `judge` block | TY-12, DP-10 |
| `test-set` | TY-13 |
| requirement, scenario, decision, invariant, term, clause, prose, example | TY-Z03 |
| `review-note` | TY-04 |
| domain, section | TY-05 |
| change unit | PR-15 |
| ledger: `knowledge`, `runtime` | LG-01 |
| store | LG-02 |
| commit | LG-06 |
| proposal, intent | LG-09 |
| apply, `before`, `after`, candidate commit | LG-14, LG-15 |
| admission | LG-21 |
| admission of runtime records | LG-52 |
| landing, land session, `awaiting-act` | LG-22, LG-26 |
| evidence, module `evidence` | LG-30, LG-32 |
| projection | LG-34 |
| fold, delta, row | LG-35 |
| read view | LG-38 |
| tuple of a pair | LG-38 |
| library | LG-44 |
| genesis, store init | LG-47 |
| namespace, namespace policy | TR-01, TR-02 |
| floor of act requirements | TR-04 |
| role | TR-08 |
| participant | TR-07 |
| session, certificate, session key | TR-11, TR-12 |
| act, owner act, delegation | TR-14, TR-17, TR-18 |
| act requirement | TR-42 |
| runner, runner session | TR-43 |
| basis | TR-19 |
| in force | TR-22 |
| standing | TR-25 |
| use, in use | TR-26 |
| fact, status fact | TR-28, TR-29 |
| verdict | TR-32 |
| finding | TR-34 |
| traceability gap | TR-36 |
| pipeline | RT-01 |
| run context | RT-03 |
| marked field | RT-33 |
| class of an operation | RT-08 |
| `setup` | RT-10 |
| bindings | RT-13 |
| run, run record, execution tuple | RT-14 |
| replay | RT-16 |
| budget | RT-19 |
| `std/verify` | RT-21 |
| recording modes: `service`, `recorded`, `fixture` | RT-22 |
| tape | RT-23 |
| memoization | RT-24 |
| delivery intent | RT-26 |
| executor | RT-31 |
| store commands | RT-32, RT-Z03 |
| decision point | DP-01 |
| allowed set, pool | DP-05 |
| candidate set | DP-Z04 |
| DecisionResult | DP-08 |
| point policy, policy evaluation | DP-13 |
| re-run, re-evaluation | DP-19 |
| authoritative run, shadow | DP-21, DP-22 |
| gate | DP-24 |
| live closure guard | DP-30 |
| calibration, sure band, grey zone | DP-25, DP-26 |
| `std/point-bench` | DP-31 |
| `solve`, need, scope | LN-01, LN-02, LN-03 |
| context budget | LN-02 |
| bench item, bench set | BN-01, BN-02 |
| `tune`, `holdout` | BN-04 |
| report | BN-11 |
| reason | OB-01 |
| step | OB-02 |
| signal | OB-11 |
| host | AG-01 |
| caller | AG-05 |
| skill | AG-10 |
| quality profile | ST-09 |
| fitness test | ST-12 |
| hard check | ST-17 |
| architecture audit, ratchet | ST-14, ST-16 |
| slice | SL-01 |
| switch | SL-03 |
| walking skeleton | SL-05 |

## Terms defined here

| ID | Term | Meaning |
|---|---|---|
| GL-01 | block, content block | A **block** is any entity. A **content block** is an entity of a `knowledge` or `composition` type: what `solve` gives out by default. Contracts and implementations are blocks too; `solve` gives them out when the scope lists their types. |
| GL-02 | corpus | The content blocks of a project that `solve` reads; one language (PR-14). |
| GL-03 | semantic judgement | A choice, a score or a yes/no about candidates whose answer comes from a model or a scorer. Deterministic code — BM25, a schema check — is not one. Every semantic judgement goes through `decide` (DP-14). |
| GL-04 | consumer | An agent or a person who uses the output of `solve` or of a decision and reports back: a verdict on truth or feedback on usefulness. |
| GL-05 | tail | The last commit of a ledger; `base` names the tail a commit was applied on. |
| GL-06 | LATTICE version | The package version. It changes everything the kernel version (KR-03) does not: `std`, the meaning of projections and fold, the set of checks, constants of the gate and of landing. A LATTICE version ships exactly one kernel version. |
| GL-07 | owner | The human participant who owns a namespace (TR-01). |
| GL-08 | check | A registered pure function over a read view, named by the rule ID it enforces, that raises findings over `knowledge` (TR-34) or signals over `runtime` (OB-11). The set of checks is closed and is code of a LATTICE version. It is not the session purpose `check` (TR-11), nor a hard check (ST-17), which refuses instead of raising. |
| GL-09 | change request | A request to merge a branch into `main`: a pull or merge request on a forge, or a branch with `local` acts when the forge is `none` (TR-41). It carries one proposal (PR-15) and is named in a commit by its `uri` (LG-06). |
