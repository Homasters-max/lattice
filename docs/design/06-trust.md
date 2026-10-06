# 06. Trust

TR-Z01. Who may change what, and what to believe: namespaces and their policy, participants, sessions, keys, acts, bases, standing, facts, verdicts and findings. Trust is computed, never assigned.

## Namespaces

| ID | Rule |
|---|---|
| TR-01 | A **namespace** is an entity `<name>/namespace` with an owner and a policy; `<name>` is the `id` prefix it owns. It is written into the namespace it creates, an exemption named in apply (LG-18), and needs the act of the floor (TR-04). The project namespace is created by store init with the owner from the init configuration (LG-47); afterwards ownership moves only by owner acts (TR-17). |
| TR-02 | Namespace policy holds: `owner`; `writers` (TR-09, TR-10); `roles` — for each role the types it may write and the repository paths it may change (TR-08, AG-08); `pins` — the LATTICE version and the libraries (LG-44); `acts` — act requirements beyond the floor (TR-42); `recovery` — the participants and the count that may replace the owner in a transfer (TR-17); `delegation` (TR-18); `labels` (TR-03); `budget` — the ceiling of a run budget (RT-19); `quality` — the quality profile (ST-09). Types never say who may write them. |
| TR-03 | A namespace may declare edge labels beyond `std` (TY-16), each with a one-line meaning. |
| TR-04 | The **floor** of act requirements, which no policy removes: an owner act on every status fact except `verdict` (TR-29), on a change of namespace policy or ownership, on an upgrade of a library or of `std` (LG-46) and on every revision of a type, the first included; an act of the owner of the project namespace on a new namespace. `acts` may only add to it. |
| TR-05 | Ownership exists only at namespace level. The owner of a type, contract, pipeline or bench set is the owner of its namespace; a different owner means a separate namespace. |
| TR-06 | Policy and owner are read as they stood before the commit of the record being judged — in the view `before` of that commit (LG-15). So a change of policy applies from the commit after the one that lands it, and a commit never grants itself a right. A later change of policy never changes what an earlier record needed or whether it is in force; the one exception is the delivery of an intent, which the caller checks against the policy in the current view (TR-42, RT-26). |
| TR-44 | After every commit the policy of the project namespace lists at least one key of its owner and one key of the participant `land`; a commit that breaks it is rejected. |

## Participants and sessions

| ID | Rule |
|---|---|
| TR-07 | A participant is of kind `human`, `agent` (a model) or `machine` (deterministic code). A `machine` participant is a program name without a version; a new version is a new session of the same participant. |
| TR-08 | A session acts in one **role** (PR-19). Policy maps each role to the types it may write; a right on a type covers its subtypes. Apply rejects an intent whose type the session's role may not write. |
| TR-09 | A writer entry lists the identities of one participant — `github:<login>`, `gitlab:<user>`, `ssh:<key fingerprint>` — and an act through any of them counts. There is no registry of actors beyond the policy. |
| TR-10 | A writer entry binds the public keys of a `human` or `machine` participant to its kind and to the roles it may take or grant. A caller is a writer whose keys take the role `caller` (PR-Z03) and grant roles to the agent sessions it starts. A runner is a `machine` writer whose keys grant the role `runner` (TR-43). An agent never holds a permanent key (TR-12). A human act is valid only under a human's key. Keys are Ed25519 in OpenSSH public key format. |
| TR-11 | `by` of every record is a **session** event (`core/session`): participant, kind, role, `purpose` — one of `init`, `work`, `import`, `check`, `bench`, `explore` — `for` (the reason, OB-01; none for purpose `init`), `parent` (the step that opened it, OB-02), software and version, and a **certificate**: the session's public key, an expiry, and a signature by a key of the participant that grants it — the caller's key for an agent it starts, or the participant's own key for a `human` or `machine` session. Apply checks the expiry against the source time of the first act counted for the proposal (TR-16), or against the `at` of the commit when no act is counted. The admission of a `runtime` commit (LG-52) checks the expiry against the time the store assigns to the append (LG-04), never against an `at` its author wrote. |
| TR-12 | An agent holds only its session key. Proposals of a session are signed with it; apply verifies the chain from a key in the policy, through the certificate, to the proposal. An expired or foreign certificate is rejected. |
| TR-13 | A session with purpose `explore` names its reason later by a `link` event in `runtime`; a session that ends without one raises a signal (OB-11). |

## Acts

| ID | Rule |
|---|---|
| TR-14 | An **act** confirms intents, answers a question, approves a delivery intent or acknowledges a signal; its verb is `approve`, `answer` or `acknowledge`. It reaches LATTICE only through the `acts` port, whose adapters are `github` and `gitlab` (a comment or review on the change request), `local` (a git commit or tag signed by SSH or GPG with the trailer `Lattice-Act: <verb> <target>`, the text of an answer in its message), `init` (store init), `fixture` (tests) and `recorded` (acts stored in a commit). A review counts only for the proposal whose hash is in the reviewed commit. |
| TR-15 | An `approve` act names the proposal hash, so one act covers a whole proposal, or names intents by `id` and body hash; it never covers an intent whose body differs. Every act counts only from an identity of a writer listed by name — never from an entry by kind. A missing act rejects a commit only where an act requirement applies (TR-04, TR-42); any other record without an act is admitted with basis `inferred` (TR-20). |
| TR-16 | Acts are checked once: landing reads them through the `acts` port and writes each as an `act` event with the `uri` of its source, its source time and the result of the check (LG-22); the store command `act` does the same into `runtime` (LG-52). Re-landing, opening a store and folding read acts through `recorded` and never call a forge. |
| TR-17 | An **owner act** is an act of the owner. A transfer of ownership takes two acts in one proposal: the old owner proposes, the new owner accepts. When the policy names `recovery`, acts of its `count` recovery participants replace the act of the old owner. |
| TR-18 | **Delegation**: the policy may list types whose intents count as acted when cited evidence shows a deterministic check in a counted run (TR-43) — for an `implementation`, an `ok` run of `std/verify` (RT-21) on the same contract revision and the same code hash. No participant acts: fold reads the decoded run and gives such records basis `observed` (TR-20); without such a run they stay `inferred`, and admission rejects only evidence that does not decode (LG-21). Delegation never covers `requirement`, `scenario`, `decision`, `invariant`, `contract`, a type, a policy or any status fact: they need a human act. |
| TR-42 | An **act requirement** is a row of `acts` in namespace policy: `match` — types, their subtypes included, status fact types, `policy`, `upgrade` and `namespace`, or a port operation `<port>#operations/<op>` (TY-09), which matches the `approve` of a delivery intent of that operation (RT-28); `from` — `owner`, a role, or a list of participants; `count` — how many distinct participants must act, 1 by default. An act of the participant of the proposal's session — for a delivery intent, of the run's session — never counts toward a `count` above 1. Apply checks the requirements of the policy in `before` (TR-06); the caller checks a requirement on a port operation before the delivery, against the policy in the current view (RT-26). |
| TR-43 | A run counts as evidence for delegation, a report, a calibration, the gate and the check "shadow disagreement" (DP-22) only if its session is of kind `machine` in role `runner` and its certificate is signed by a key that the policy in `before` lets grant `runner`. Such a session is a **runner session**; CI is the default runner. Any other run decodes and counts for nothing. |

## Bases

| ID | Rule |
|---|---|
| TR-19 | A record has one of four **bases** — categories, not a scale: `asserted` (a human stated it), `derived` (a deterministic transformation of a source), `observed` (a deterministic check or measurement), `inferred` (output of an agent, a model or a judge). |
| TR-20 | Fold computes the basis of a `knowledge` record (LG-35) from its session, the act on its intent and, for a record derived from a run, the cited run (TR-21). The first matching row applies; only an act or delegation lifts a record above `inferred`: |

| Record | Act | Basis |
|---|---|---|
| delegated (TR-18) | — | `observed` |
| any | none | `inferred` |
| derived from a cited run whose pipeline has a `decide` stage or a stage using an `llm` operation | an act of a human | `asserted` |
| derived from such a run | any other act | `inferred` |
| by a `human` or `agent` session | yes | `asserted` |
| by a `machine` session, purpose `check` or `bench` | yes | `observed` |
| by a `machine` session, purpose `init`, `work` or `import` | yes | `derived` |

| ID | Rule |
|---|---|
| TR-21 | A record written from the output of a run references that run through its cited evidence (LG-30), label `derived-from`; fold decodes the run to read its pipeline. A record that measures runs, such as a report, references them with label `measures` and is not derived from them (BN-11). That a session cites the run its records come from is a review boundary (ST-13): apply cannot see a run nobody cited. |
| TR-22 | `inForce(record)` is a pure function over the ledger. A fact or an entity revision is in force iff its basis is one its base type allows (TR-23), the acts that the requirements of the policy before its commit need exist (TR-06, TR-42), and among such records it is the latest by `seq` for its key or `id` — for an entity, the **current revision**. Nothing else counts: no scores, no heuristics, no `runtime` records. The **latest revision** of an entity is the one with the highest `rev`, in force or not; expected revisions, no-ops and the next `rev` are counted from it (LG-11, LG-13). |
| TR-23 | Records of a `hint` type may be in force with any basis. Records of every other type are in force only with `asserted`, `derived` or `observed`. So a judge or a model never writes knowledge by construction. |
| TR-24 | An act on an intent authored by an `agent` session makes the record `asserted`: the act and `by` show who drafted it and who approved it. Knowledge written from a hint carries a reference to that hint, label `derived-from`. |

## Standing

| ID | Rule |
|---|---|
| TR-25 | The **standing** of a reference is `{inForce, basis, use, live}`: whether the record is in force, its basis, its use, and — for a pipeline — the value of its `live` fact, or `null`. The rules of standing are pure functions of trust; fold writes their rows; a read view answers `standing(ref)` (LG-38). |
| TR-26 | The **use** of an entity is `in-use` — a revision is in force and neither `retired` nor `alias` is in force for it; `retired`; `alias`, with the canonical `id`; or `not-in-force` — no revision is in force. An entity is **in use** iff its use is `in-use`. |
| TR-27 | Tests of standing: the basis table and the in-force predicate as pure functions over every row of their tables; use on fixtures of `retired`, `alias`, a revoked `retired` and a revision without an act; `standing` through a read view on the `memory` store. |

## Facts

| ID | Rule |
|---|---|
| TR-28 | A **fact** is an event `{of, key, value}`; its type declares which fields form `key`. The current value is the latest fact in force by `seq` for its key. A fact is cancelled by a later fact with the same key and `revoked: true`, never by `value: false`. |
| TR-29 | **Status facts** state that something is in use, replaced, promoted, accepted, voted on or dismissed; there is no other mechanism for it: |

| Type | Key | Value |
|---|---|---|
| `retired` | entity `id` | — the entity is out of use |
| `alias` | entity `id` of the alias | the canonical entity `id`, in the same namespace; aliases form a star, never a chain |
| `live` | `id` of a pipeline | `{pipeline@n, setup@m, tuple}`: the pair that drives execution and the hash of its tuple (DP-21) |
| `calibration` | point `id`, hash of its question, `judge@n`, `set@n` | a reference to the `holdout` report (BN-11) |
| `verdict` | participant, subject `ref@n` | `for` or `against` |
| `dismissed` | finding rule ID, subject `ref@n` | — |

| ID | Rule |
|---|---|
| TR-30 | When a fact's value is overwritten by another participant, the finding "overridden" is raised for the owner; the earlier value stays in history. |
| TR-31 | A fact whose value equals the current value for its key is a no-op. |

## Verdicts

| ID | Rule |
|---|---|
| TR-32 | A **verdict** is written and revoked only by its own participant: one vote per participant and subject, the later replacing the earlier. It attaches to `ref@n` and never moves to a new revision, which starts at zero. Verdicts of agents, models and judges carry no votes. Verdicts of `bench` sessions go to calibration, not to trust. A consumer's feedback on usefulness is not a verdict; it goes to the bench (BN-05). |
| TR-33 | Verdict counts are shown per basis, never summed, and never change anything by themselves. They are used as trust evidence in output and as a finding when the votes against reach 3, a constant of the LATTICE version. Trust never decays with time; judge scores are never evidence of truth. |

## Findings

| ID | Rule |
|---|---|
| TR-34 | A **finding** is a notice for an owner, raised over the `knowledge` view only by a registered check named by its rule ID. The checks are a closed set, code of a LATTICE version: reference to a retired entity (RF-05), orphan block (RF-11), contract behind (RF-20), overridden (TR-30), vote threshold (TR-33), traceability gap (TR-36), missing source item (TR-39), open review note (TY-04), regression (BN-16), shadow disagreement (DP-22), report of an uncalibrated binary point (DP-18), dangling fragment (RF-23), target moved (RF-24), evidence source out of use (TR-45), stale calibration (DP-28). A finding without a rule ID does not exist. A finding is addressed by `{rule, subject}`, its rule ID and subject `ref@n`; that is how a session names a finding as its reason. |
| TR-35 | Findings are computed on demand by `findings(view, {rules?, subjects?}) → [{rule, subject}]` and are never stored. A check reads only the read view, cited evidence included. A check never raises a finding on an entity that is not in use (TR-26): an orphan, a gap or a contract behind that left use raises nothing. The gate asks for its own rules and subjects (DP-24). |
| TR-36 | Traceability gaps are findings: a requirement without a scenario; a requirement without a contract that references it; a contract without a `test-set`; a scenario no `test-set` covers; an invariant without `checked_by`. The gate refuses `live` for a pipeline whose contracts have an open gap (DP-24). |
| TR-37 | A finding closes when its cause disappears, or by a `dismissed` fact keyed by rule ID and subject `ref@n`. A new revision of the subject raises it again. |
| TR-38 | Tests of checks: for every rule ID a fixture that raises it and one that does not; `dismissed` closes a finding and a new revision of its subject raises it again; the filter by rules and subjects. |
| TR-45 | A record whose basis `observed` comes from delegation through a `test-set` that is no longer in use raises the finding "evidence source out of use". |

## Sources

| ID | Rule |
|---|---|
| TR-39 | Knowledge of another system enters through a source adapter: imported into own blocks with basis `derived` and an external link to the source. Re-import writes only what changed. The listing the import saw is a `source-listing` fact; an item missing from the latest listing raises the finding "missing"; import never retires a block. An import is a run of a pipeline whose stages read the source through a port; the caller drafts its output into a proposal in a `machine` session with purpose `import`, which cites the run. |
| TR-46 | Tests of import: a first import drafts the blocks, their external links to the source and a `source-listing` in a `machine` session with purpose `import` that cites the run; a re-import of an unchanged source lands as `no-op`; an item missing from the latest listing raises the finding "missing" and retires nothing. |

## Language

| ID | Rule |
|---|---|
| TR-40 | Text for a human reader that never returns into the system — messages of LATTICE, rejections, reports, a translation of a block shown on request — may be in the reader's language. Messages come from templates; a translation is a recorded run marked as a translation and never enters `knowledge`, a card or `solve`. |

## Forge

| ID | Rule |
|---|---|
| TR-41 | Comments, statuses and issues on a change request are `write` operations of the `forge` port, a port of the runtime whose adapters are `github`, `gitlab` and `none`. They are delivered as intents (RT-26); a project without a forge uses `none` and `local` acts. |
