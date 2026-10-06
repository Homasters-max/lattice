# LATTICE design

RM-Z01. LATTICE is a governance substrate. It gives every project one way to record knowledge, change it, compose behaviour, execute it and record what happened. A software factory and a data platform are built on it the same way: they differ in their data, contracts and implementations, never in mechanisms.

RM-Z02. Documents:

| Doc | Prefix | Subject |
|---|---|---|
| [00 Glossary](00-glossary.md) | GL | terms |
| [01 Principles](01-principles.md) | PR | principles, change units, roles, order of work |
| [02 Kernel](02-kernel.md) | KR | record, canonical form, type, schema, reference |
| [03 Types](03-types.md) | TY | the `std` library: base types and the types LATTICE reads |
| [04 References and evolution](04-references.md) | RF | resolution, edges, evolution of types and contracts |
| [05 Ledger](05-ledger.md) | LG | stores, proposals, apply, landing, evidence, projections and read views, codec, libraries |
| [06 Trust](06-trust.md) | TR | namespaces, participants, sessions, acts, bases, standing, facts, findings |
| [07 Runtime](07-runtime.md) | RT | pipelines, setup, runs, recording, delivery, execution |
| [08 Decision pattern](08-decision.md) | DP | semantic judgements: points, judge, policy, calibration, gate |
| [09 LENS](09-lens.md) | LN | `solve`: candidates, ranking, expansion, output |
| [10 Bench](10-bench.md) | BN | sets, metrics, targets |
| [11 Observability](11-observability.md) | OB | trace, git links, signals |
| [12 Agents](12-agents.md) | AG | agent roles, caller, agent channels, skills |
| [13 Structure](13-structure.md) | ST | modules, fitness tests, quality profile, methodology |
| [14 Slices](14-slices.md) | SL | order of implementation |
| [15 Later and not taken](15-later.md) | LT, NX | deferred items with triggers, rejected ideas |

## Conventions

| ID | Rule |
|---|---|
| RM-01 | One ID — one block. A rule is a table row whose first cell is its ID, or a paragraph that starts with its ID followed by a dot. |
| RM-02 | An ID is `<PREFIX>-<NN>` for a rule and `<PREFIX>-Z<NN>` for prose and examples; the prefix is the document's. From the switch on (SL-03) an ID is never reused and never renumbered. |
| RM-03 | The design is written in English. It is the first corpus LATTICE reads about itself (SL-02), so it follows the corpus language rule (PR-14). |
| RM-04 | A rule states what holds. A reason is at most one clause; a longer argument belongs in a `decision` block. Documents carry no history, no change log and no "depends on" section: the ledger keeps history and referrers show dependencies (RF-09). |
| RM-05 | "Only", "never", "always" and "exactly" are exact. A rule that has an exception names it. |
| RM-06 | Until the switch (SL-03) these files are the source, edited by hand in the codec format (RM-07). From the switch on they are export only (LG-43). |

RM-Z03. The codec format (RM-07) maps `md` to blocks:

| In `md` | Block |
|---|---|
| a table row with an ID | a block of type `clause`; its cells, in column order, are `{column, text}` (LG-42) |
| a paragraph starting with an ID | a block of type `prose`; its text is the paragraph |
| a table or a list without IDs right after a block whose text ends with ":" | a field of that block |
| a fenced code block with an ID after its language | a block of type `example`; its text is kept verbatim, never parsed |
| an ID mentioned in text, and every ID of a range | a floating reference extracted from the text; the text is stored verbatim |
| an ID inside inline code | text, not a reference |
| a link to a document or a section | part of the prose text, stored verbatim |
| a section | a `section` composition of references and headings; a document is the section of level 1 |
| an ID | the entity `lattice/<id in lower case>` |
| a document, a section | the entity `lattice/<file name without .md, in lower case>` for a document, `<entity of its document>.<slug of its heading>` for a section |
| a heading, a table header | its slug: the text in lower case, every run of characters outside `a-z0-9` replaced by `-`, no `-` at either end |

| ID | Rule |
|---|---|
| RM-07 | One codec module holds the whole `md` format (LG-42); no other code knows it. Import of these files and export back give the same bytes. |

## Mechanisms

RM-Z04. The mechanisms of LATTICE. Everything else is data, `std` capabilities, libraries or programs on the public API, such as the caller (AG-05):

| Mechanism | Rules | Module |
|---|---|---|
| record, canonical form and hash | KR-04…KR-13 | kernel |
| types, schema and `compare` | KR-14…KR-22 | kernel |
| references and their resolution | KR-23…KR-25, RF-01…RF-08 | kernel, ledger |
| graph, identity and evolution | RF-09…RF-24 | ledger |
| stores, chains and replication | LG-01…LG-08, LG-27 | ledger |
| proposals, apply and admission | LG-09…LG-21, LG-54 | ledger |
| landing and CI | LG-22…LG-26, LG-28, LG-29, LG-51, LG-53 | ledger |
| evidence | LG-30…LG-33 | evidence |
| fold and read views | LG-34…LG-41 | ledger |
| admission of runtime records | LG-52 | ledger |
| codec and export | LG-42, LG-43 | codec |
| libraries, upgrade and genesis | LG-44…LG-50 | ledger |
| namespaces, acts and certificates | TR-01…TR-18, TR-42…TR-44 | trust |
| bases, in force, standing, facts and verdicts | TR-19…TR-33 | trust |
| checks of findings and signals | GL-08, TR-34…TR-38, TR-45, OB-11, OB-12 | ledger |
| pipeline validation and execution | RT-01…RT-09, RT-33 | runtime |
| setup, code hashes, start-up and executor | RT-10…RT-13, RT-31 | runtime, ledger, assembly, adapters |
| runs, replay, budget and escalation | RT-14…RT-21, RT-34 | runtime |
| recording and memoization | RT-22…RT-25 | runtime |
| delivery | RT-26…RT-28 | runtime |
| model calls | RT-29, RT-30 | runtime, adapters |
| commands and entry points | RT-32 | cli |
| single channel of judgement | DP-14 | runtime, `test/` |
| point policy evaluation | DP-04, DP-08, DP-13, DP-17 | measure |
| authority, gate and live closure guard | DP-21, DP-24, DP-30 | ledger, measure |
| calibration admission | DP-25…DP-28 | ledger, measure |
| metrics, splits and reports | BN-04, BN-07, BN-10, BN-11, BN-13…BN-17 | ledger, measure |
| trace and git links | OB-01…OB-10, OB-13…OB-15 | ledger, runtime |
| generation | ST-08, ST-09 | generate |
| structure and fitness tests | ST-04…ST-06, ST-10, ST-12, ST-17 | `test/` |

| ID | Rule |
|---|---|
| RM-08 | A mechanism not in RM-Z04 does not exist. A new mechanism is a row of RM-Z04 and a rule with an ID in the same change (PR-03). |
