# 03. Types

TY-Z01. The `std` library: the base types, and the types LATTICE itself reads. `std` is a library like any other (LG-44), shipped with each LATTICE version. A project defines its own types by `extends` from `std` or from another declared library.

## Layers

| ID | Rule |
|---|---|
| TY-01 | `core` holds the meta-type (KR-14) and the session type (TR-11); ledger code writes both into the genesis commit of every ledger (LG-47). `std` is a library: its own ledger, shipped in the LATTICE package, visible to a project at the version its namespace pins (LG-44). A project or a library holds its own types. |
| TY-02 | The types LATTICE reads change only with a LATTICE version, through an upgrade of `std` (LG-46). |

## Base entity types

| ID | Rule |
|---|---|
| TY-03 | Every entity type extends one of the base types. Every base type declares an optional field `supersedes`: a list of pinned references, label `supersedes` (RF-12). |

TY-Z02. Base entity types:

| Type | Holds | Read by |
|---|---|---|
| `knowledge` | what the project knows: statements, clauses, explanations | people and `solve` |
| `composition` | only references and structural labels — order, section, heading; free text is excluded by its schema | navigation and `solve` |
| `contract` | a boundary of behaviour (TY-07) | the runtime, people, `solve` |
| `implementation` | code implementing one contract revision (TY-11) | the runtime |
| `behaviour` | blocks LATTICE reads to act: pipeline, `setup`, namespace, quality profile, test set | LATTICE |
| `decision-point` | one semantic judgement (DP-01) | `decide` |
| `hint` | an inference that is never knowledge; the only base type whose records may be in force with basis `inferred` (TR-23) | people and `solve`, marked as hints |

## Knowledge types

TY-Z03. Knowledge types in `std`; `card` shows the default card fields:

| Type | Extends | Body | Card |
|---|---|---|---|
| `requirement` | `knowledge` | `title`, `statement` | title, statement |
| `scenario` | `knowledge` | `requirement` (pinned ref, label `part-of`), `title`, `given`, `when`, `then` | title, when, then |
| `decision` | `knowledge` | `title`, `context`, `choice`, `consequences`, `decides` (refs, label `decides`) | title, choice |
| `invariant` | `knowledge` | `title`, `statement`, `checked_by` (refs to `test-set` or `clause` blocks, label `verifies`) | title, statement |
| `term` | `knowledge` | `term`, `definition` | term, definition |
| `clause` | `knowledge` | `cells` — the cells of a table row of a document in column order, each `{column, text}`, `column` the slug of its header (LG-42) | the texts of its cells |
| `prose` | `knowledge` | `text` — a prose block of a document | text |
| `example` | `knowledge` | `lang`, `text` — kept verbatim, never parsed | text |
| `bench-item` | `knowledge` | BN-01 | — |
| `review-note` | `hint` | `about` (ref, label `about`), `subject` (ref to the clause, requirement or scenario it says is not met, label `about`), `note` | note |

| ID | Rule |
|---|---|
| TY-04 | A `review-note` names what it says is not met; a note without a `subject` is rejected by its schema. An open note raises a finding for the owner (TR-34). |
| TY-05 | `domain` and `section` extend `composition`. A `domain` groups blocks for navigation and search; it owns nothing. A `section` is a part of a document (LG-42). |

## Contracts and code

| ID | Rule |
|---|---|
| TY-06 | A contract is a boundary of behaviour, and a port is a contract. Its shapes of data are abstract types referenced by `$ref`; a contract holds no schema of its own. |
| TY-07 | `contract` is the base; it has two `std` subtypes, and a project may narrow them further: |

| Type | Body |
|---|---|
| `stage` | `input`, `output`, `params` — abstract types; `statuses` — a closed list, default `ok`, `unavailable`; `uses` — pinned references to the `port` revisions it reaches |
| `port` | `operations` — a map from operation name to `{input, output, class, idempotent, memo}`; `class` is one of `read`, `write`, `llm`, `irreversible` (RT-08); `memo` — the paths into `input` that form the memo key (TY-10) |

| ID | Rule |
|---|---|
| TY-08 | The author may treat a change that `compare` finds compatible as breaking by giving it a new contract `id` (RF-18); never the reverse (RF-16). |
| TY-09 | An operation of a port is addressed by fragment: `std/llm@1#operations/complete` (KR-23). |
| TY-10 | `memo` is a list of paths in the syntax of a fragment (KR-23); apply rejects a port revision whose `memo` names a path that does not exist in the operation's `input` type. An operation without `memo` is never memoized. `std/llm` declares `[model, prompt, schema, input, params]` for `complete`; `std/judge` declares `[question, judge, candidates, state]` for `evaluate` (DP-20). |
| TY-11 | The abstract shape `code` is `{module, hash}`; its hash is defined by RT-12. `implementation` holds `contract` — a pinned reference to one `stage` or `port` revision, label `implements` — and `code`. An implementation of a `stage` is a **capability**; an implementation of a `port` is an **adapter**. |
| TY-12 | `judge-adapter` extends `implementation` for the `judge` port and adds `model`: the exact model id it pins (DP-10). A block of this type is a `judge` block, pinned as `judge@n`. The type is not named `judge`: the port is `std/judge` (TY-10), and one `id` has one type (KR-07). |
| TY-13 | `test-set` extends `behaviour`: `contract` — the pinned contract revision under test, label `verifies` — `code`, and `covers` — references to the scenarios it checks, label `verifies`. A test set is never an implementation: `setup` never binds it, and a right to write implementations never covers it. It runs as input of the pipeline `std/verify` (RT-21). |

## Behaviour types

TY-Z04. Behaviour types in `std`, each defined where it is used:

| Type | Defined by |
|---|---|
| `pipeline` | RT-01 |
| `setup` | RT-10 |
| `namespace-policy` | TR-01, TR-02 |
| `quality-profile` | ST-09 |
| `test-set` | TY-13 |

## Event types

TY-Z05. Event types, by the ledger they live in:

| Ledger | Types |
|---|---|
| both | `session` (`core`, TR-11) and `act` (TR-14): in the ledger of the records they author or confirm |
| `knowledge` | status facts (TR-29): `retired`, `alias`, `live`, `calibration`, `verdict`, `dismissed`; `report` (BN-11); `source-listing` (TR-39) |
| `runtime` | `step` (OB-02), `link` (OB-01), `run` and its tape entries (RT-14, RT-23), `question` (RT-18), `delivery-intent`, `delivery-attempt` (RT-26), `code-commit` (OB-08) |

| ID | Rule |
|---|---|
| TY-14 | Every fact type extends the abstract event shape `fact`: `of` — what it is about, `{role: ref@n}`; `value`; `revoked`. Its key fields carry the annotation `key` (KR-19). The status fact types are closed: they cannot be extended, and a new one comes only with a LATTICE version. |

## Shapes and edges

| ID | Rule |
|---|---|
| TY-15 | `std` ships abstract shapes for reuse. `valid-period` is `{valid_from, valid_to}` of format `date-time` or `date`: `valid_from` inclusive, `valid_to` exclusive, `null` meaning open. It is data; the kernel gives it no meaning (KR-09). |
| TY-16 | `std` defines the base edge labels: `implements`, `verifies`, `decides`, `uses`, `part-of`, `about`, `caused-by`, `derived-from`, `measures`, `supersedes`. A project declares further labels in its namespace (TR-03). |
