# 14. Slices

SL-Z01. The order of implementation. Every slice ends with an end-to-end check in CI and numbers, not with code.

## Rules

| ID | Rule |
|---|---|
| SL-01 | Slices go in order: S0 → SW → S1 → S2 → S3 → S4. A slice is done when its check passes in CI, and it leaves a CLI command the owner uses to accept it. A slice never starts a mechanism that a later slice proves. |
| SL-02 | The first corpus is the design of LATTICE itself, in English. A foreign corpus comes in S4, through a source adapter (TR-39). |
| SL-03 | The **switch** moves the design into the ledger. It happens when all hold: (1) the round trip of `docs/design` is green in CI; (2) the schema subset covers every `std` type this design names, with their schemas drafted, and the kernel freezes as version `1`; (3) an upgrade `std@1 → @2` passes in a test; (4) CI checks change requests as LG-51 (1)–(4) requires, with `local` acts; (5) `draft` exists; (6) one real design edit landed through a proposal from a branch. At the switch genesis is written under kernel `1` and `import-md` runs once with the owner's act; from then on `docs/` is export only, and LATTICE describes its own modules as contracts, implementations and test sets. |
| SL-04 | Before the switch the kernel version is `0` and every store is disposable: it is rebuilt from `docs/design`. |
| SL-05 | Every slice starts with a **walking skeleton**: one thin change unit through every seam — command → `land --dry-run` with at least one rejection carrying its rule ID and fixture → `land` → `append` with its delta → a question to the read view. It creates every module folder of the slice, the whole matrix of ST-01 in the structure test, every port interface of the slice and the command table. After it the slice grows in parallel change units, one per contract, never per layer. |
| SL-06 | At most three change units are in implementation at once while the owner's acts are the bottleneck; delegation (TR-18) raises the limit. |
| SL-07 | Every rule ID of this design belongs to the slice that implements it: the slice of its document, or the slice an exception names (SL-Z04). After the switch, a rule ID whose slice is done and that no `test-set` or fixture covers is a traceability gap (TR-36). |
| SL-08 | The first bench set has about 60 questions about this design, from real tasks, with `trap` and `blank` items; before S3 it grows to the size BN-14 needs after the split. |

## Slices

SL-Z02. The slices:

| Slice | Proves | Done when |
|---|---|---|
| **S0** Kernel and ledger | kernel (02), types (03), references (04); ledger (05): proposals, apply, fold and read views, landing with the `git` port and `local` acts, the codec; trust (06): namespace and pins, sessions and certificates signed by a human's or a machine's own key, standing; the `setup` type as data; stores `memory` and `jsonl`, with evidence kept as opaque bytes; signatures of commits | `docs/design` → blocks → `md` is byte-identical in CI; a rebuild of every store equals its rows |
| **SW** Switch | SL-03 | the first design edit landed through a proposal; the modules of LATTICE are contracts in its ledger |
| **S1** Runtime and solve without judge | runtime (07), recording, the module `evidence`, the `postgres` store and `sync`, signatures of runtime streams and runner sessions, the admission of runtime records and the store command `act`, `cite`, `report` and the bench of the caller, the bases of records derived from runs, the runtime read view (LG-40), the checks of findings and signals, trace and git links (11), caller with the `acp` channel and hooks (12), `lens.candidates` on BM25 and expansion, the first bench set | `solve` on its own design gives baseline `hit@k` and pool recall; it becomes `live` through the gate with starting targets: pool 200, output 5–20 blocks, the expected block in the output for at least 95% of items; the `postgres` replica equals the git chain |
| **S2** Decide in shadow | decision pattern (08), Jev for `lens-rank`, `lens-sufficient` with a model through `ai-sdk`, calibration, bench drafts from the trace | a revision of `solve` with `lens-rank` runs in `shadow` against the `live` S1 revision; consistency across languages is measured |
| **S3** Factory in production | the gate with calibrated points, certificates issued by the caller with role keys, `std/verify` and delegation by evidence, the `subprocess` executor | a pipeline that pins a calibrated point becomes `live` through the gate on `holdout`; an implementation is admitted by delegation after an `ok` run of `std/verify`; one change unit goes from a requirement to `live` through agent roles |
| **S4** Libraries and a second project | libraries, the visible set, `upgrade`, a source adapter | two projects run on one shared library with no boundary violation; a foreign corpus is imported; a second point, scenario coverage, runs in `shadow` |

SL-Z03. Everything in 15 stays out of these slices until its trigger fires.

SL-Z04. The slice of each rule (SL-07); a rule takes the slice of its document unless an exception names it:

| Document | Slice | Exceptions |
|---|---|---|
| README, 00, 01, 02, 13, 14 | S0 | ST-10 — SW; PR-20 — S1 |
| 03 Types | S0: types as data; every `std` schema is drafted by SW (SL-03) | TY-04 — S1 |
| 04 References | S0 | RF-10, RF-11, RF-20, RF-23, RF-24 — S1; RF-21 — S3 |
| 05 Ledger | S0 | LG-07, LG-08, LG-21, LG-27, LG-30…LG-33, LG-40, LG-52 — S1; the `runtime` parts of LG-02 and of LG-03, the `tuple` of LG-38 and landing by CI with the step it records (LG-28) — S1; condition (5) of LG-51 — S3; LG-43, LG-46, conditions (2) and (4) of LG-51, and the `docs/` that landing writes (LG-22) — SW; LG-49 — later (LT-01) |
| 06 Trust | S0 | TR-13, TR-21, TR-30, TR-32…TR-38, TR-41, TR-43 — S1; the rows of TR-20 for records derived from runs — S1, for delegation — S3; the check of TR-11 against the time of the store and the `github` and `gitlab` adapters of TR-14 — S1; TR-18, TR-45, the keys by which a caller grants roles (TR-10) and the sessions of agents (TR-12) — S3; the match on a port operation of TR-42 — S1; TR-39, TR-46 — S4 |
| 07 Runtime | S1 | RT-10 as a type — S0; RT-32 for `init`, `draft`, `land`, `verify-store`, `export`, `migrate`, `session` — S0, for `import-md`, `upgrade` — SW, for `rebind` — S3; RT-30 — S2; RT-21 and `subprocess` of RT-31 — S3 |
| 08 Decision pattern | S2 | DP-21, DP-24 and DP-30 — S1, condition (5) of DP-24 — S3 |
| 09 LENS | S1 | LN-10, LN-12 — S2 |
| 10 Bench | S1 | BN-06 — S2 |
| 11 Observability, 12 Agents | S1 | the role keys of AG-05 — S3 |
