# 05. Ledger

LG-Z01. How records are ordered, stored, changed and read: two ledgers per project, the store, proposals, apply as the only path into knowledge, landing, evidence, projections and read views, the codec, libraries, genesis.

## Stores

| ID | Rule |
|---|---|
| LG-01 | A project has two ledgers of one format. **`knowledge`** holds what the project knows: types, blocks, contracts, implementations, pipelines, facts, acts, reports, and the sessions that authored them. **`runtime`** holds what happened: sessions, acts, steps, runs, questions, deliveries, code commits. A session or an act lives in the ledger of the records it authors or confirms. |
| LG-02 | Storage is behind the `store` port. `append(commit, delta, evidence)` writes a commit, the delta it folds to (LG-35) and the evidence it cites, atomically; in `runtime` it assigns `seq` and the time of the append (LG-04), refuses the commit when that time is past the expiry of the certificate of its stream's session (TR-11, LG-52), and returns both; `commits(from)` and `tail()` read the chain, in `runtime` with the `seq` and time of each append (KR-09); rows are read by key and by key prefix; `evidence(hash)` returns the bytes of an evidence file; `content(hash)` returns a text that a step of a `runtime` commit references by hash, written by the `append` of that commit (OB-05). Adapters: `postgres` — the working store of both ledgers, keeping rows, evidence and content; `jsonl` — the git copy of `knowledge` in `store/`, offline work, bootstrap; `memory` — tests. For `jsonl` and `memory` the ledger folds from genesis when the store opens and hands the rows to the adapter, which keeps them in memory; git holds commits and evidence, never rows. |
| LG-03 | One set of contract tests runs against every adapter of `store`: commits, rows, `view(seq)` and evidence are byte-identical across adapters, and every adapter refuses a `runtime` append past the expiry of the certificate of its stream's session. |
| LG-04 | Order is `seq`, one sequence per ledger. In `knowledge` apply assigns it, dense from 1. In `runtime` the store assigns it together with the time of the append, taken from the store's own clock and never from the commit; `seq` strictly grows and may have gaps. Order is never read from `at`. |
| LG-05 | Every `knowledge` commit carries the hash of the previous one. The chain and the signatures of every commit (LG-06) are verified when a store opens. |
| LG-06 | A `knowledge` commit header is `{seq, prev, kernel, base, proposal, proposal_sig, by, at, request, sig}`: `base` the `seq` it was applied on; `proposal` the hash of the proposal and `proposal_sig` its signature (LG-10); `by` the session that landed it and `at` the time of landing (LG-22); `request` an optional `uri` of the change request; `sig` an Ed25519 signature, by the key of the land session, of the hash of the commit, which is computed without `sig`. Its records follow in canonical order: entity `id`, fact key, event `id`. `at` never decreases along the chain; a commit whose `at` is earlier than its predecessor's is rejected and landed again. |
| LG-07 | `runtime` is chained per stream: the records of one session or of one run form one hash chain. A `runtime` commit appends records to one stream; it has no `proposal` and carries `sig`, an Ed25519 signature of its hash by the key of the stream's session (TR-12). Appending a commit whose hash the stream already holds returns it and writes nothing. |
| LG-08 | In `postgres` the canonical bytes (KR-10) are the stored value; a `jsonb` copy serves queries only. A hash is computed only from the canonical bytes. Each project has its own database schema. |

```json LG-Z02
{ "seq": 1042, "prev": "sha256:…", "kernel": "1", "base": 1041,
  "proposal": "sha256:…", "proposal_sig": "ed25519:…", "by": "01JB7…", "at": "2026-10-06T12:00:00.000000Z",
  "request": "https://git.example.org/lattice/pull/42", "sig": "ed25519:…",
  "records": [ … ] }
```

## Proposals

| ID | Rule |
|---|---|
| LG-09 | A change of `knowledge` is a **proposal** file: `{session, intents, sig}`. `session` is the authoring session event with its certificate (TR-11). An intent is `{op, id, type, expected, at, body}`: `op` is `entity` or `event`; `expected` is the latest revision (TR-22) an entity intent was written against, or `null` for a new entity. An intent carries every value not computed from the tail — every `id` of an event, every `at` — and its `by` is the proposal's session. Apply assigns only `seq`, `rev` and `hash`. |
| LG-10 | The hash of a proposal is the hash of its canonical bytes without `sig`, with intents in canonical order (LG-06). `sig` is an Ed25519 signature of that hash by the session key (TR-12). |
| LG-11 | An entity intent whose `expected` differs from the latest revision is rejected, and the author rebuilds the proposal; apply gives the new revision the next `rev` after the latest. An event intent is appended. A commit holds at most one intent per entity `id` and per fact key. Any order of intents gives the same outcome and the same bytes. A type and blocks of that type may be written in one commit. |
| LG-12 | Applying a proposal whose hash is already in the ledger returns that commit and writes nothing. An empty commit is never written: when every intent is a no-op (LG-13), apply reports `no-op`. |
| LG-13 | An entity intent whose body hash equals the latest revision's is a no-op when that revision is in force; a revision not in force is confirmed by a new revision with the same body and an act. A fact whose value equals the current value for its key is a no-op (TR-31). |
| LG-54 | Every change request carries exactly one proposal (PR-15). A change request that changes no knowledge carries a proposal without intents, which lands as `no-op` (LG-25). |

## Apply

| ID | Rule |
|---|---|
| LG-14 | **Apply** is the only path into `knowledge`. It is a pure function `apply(before, proposal, acts, evidence) → commit \| no-op \| rejections`: `before` the read view at the tail (LG-38); `acts` the session of landing and the act events it formed (LG-22); `evidence` the evidence files the proposal cites (LG-30). It runs only inside landing, which also serves the author's local check (LG-26); `runtime` commits pass its phases Record and Schema and the signature, expiry and role checks of Authority (LG-52). |
| LG-15 | After phase 1 apply forms the candidate commit — assigning `seq`, `rev` and `hash` — and computes `after = before ⊕ fold(before, candidate, evidence)` (LG-35) without writing it. Every later phase reads the view the table names: `before` is the tail, `after` is the tail plus the whole commit. So what apply checked is exactly what the projections show once the commit lands. |
| LG-16 | Apply checks in phases. Inside a phase it collects every rejection; it stops after the first phase that rejects: |

| Phase | Checks | Reads | Layer |
|---|---|---|---|
| 1 Record | header, canonical bytes, formats (KR-04…KR-13) | — | kernel |
| 2 Schema | type bodies and `extends`, body against its `type@n` (KR-14…KR-22); a type may be in the same commit | `after` | kernel |
| 3 Commit | expected revisions, one intent per key, `at` order, events never changed (LG-06, LG-11) | `before` | ledger |
| 4 References | visible set, existence, fragments, labels, paths of `memo` (RF-01…RF-08, TY-10) | `after` | ledger |
| 5 Authority | certificate and signature, role, writers, act requirements, the expiry of certificates (TR-04, TR-08…TR-12, TR-14…TR-17, TR-42) | `before` | trust |
| 6 Evolution | type revisions, contract classes, pins (RF-13…RF-19), the liveness of the policy (TR-44) | both | ledger |
| 7 Admission | the gate of `live` and the live closure guard, reports, calibrations, delegation (LG-21, DP-30) | `after`, evidence | ledger, measure |

| ID | Rule |
|---|---|
| LG-17 | A rejection is `{intent, rule, message, path, expected, got}` and names the rule ID it enforces; a duplicate also names the `id` it collided with. The checks of apply are hard checks (ST-17): every rule ID they enforce has a fixture that triggers it and one that passes it. |
| LG-18 | The exemptions of genesis and store init — the self-typed meta-type, the session type written with the first session, a namespace written into the namespace it creates, in the ledger of `std` the types its namespace record needs written with that namespace, init sessions without a reason, `sig` and `proposal_sig` `null` in genesis — are named by rule ID in apply, never inferred from a key. |
| LG-19 | Uniqueness (KR-19) is scoped to the author's namespace and counts only entities in use (TR-26). Revoking `retired` or `alias` re-checks it. A type revision that changes `unique` is checked against every block in use. |
| LG-20 | Every value read through `$env` (RT-13) is registered as a secret. Landing rejects a proposal that contains one before apply; recording, `cite` and `export` refuse to write one; no message repeats it. A canary test plants a fake secret and searches the stores, tapes and evidence for it; the result must be empty. |
| LG-21 | Phase 7 is one function over `after` and the runs decoded from the cited evidence (LG-32). Every cited evidence file must decode, and a run counts only if its session is a runner session (TR-43). Its rules: the gate of `live` (DP-24), the live closure guard (DP-30), the admission of a report (BN-13) and of a calibration (DP-25). Delegation (TR-18) rejects nothing: fold gives a delegated record basis `observed` from a counted run (TR-20), and without that run the record stays `inferred`. Metrics are computed by `measure` from the decoded runs and the bench items. |

## Landing

| ID | Rule |
|---|---|
| LG-22 | A `knowledge` commit is born in git by **landing**: `land(proposal, tail, acts?)` in a `machine` session `land`. Landing writes the event of its **land session** into the commit it lands: participant `land`, kind `machine`, purpose `work`, `for` the reason of the proposal's session; it is `by` of the commit and of its `act` events. Landing reads the acts on the change request through the `acts` port and forms them as `act` events (TR-16), applies the proposal on the tail, and makes one git commit: a merge of the change request into the tail of `main`, whose second parent is the head of the change request, with the commit appended to `store/knowledge.jsonl`, the cited evidence in `store/evidence/`, `docs/` written from the new tail (LG-43) and the proposal file removed. The git commit carries the trailers of OB-07 — `Lattice-Session` and `Lattice-Reason` of the proposal's session, `Lattice-Step` of the landing step (LG-28) — and `Lattice-Proposal` with the proposal hash and `Lattice-Seq` with the `seq`. |
| LG-23 | Landing reaches git only through the `git` port: `tail(ref)`; `prepare(request, onto) → worktree \| conflict`; `push(worktree, ref, expected, message, trailers) → pushed \| moved`, a compare-and-swap on `expected`. Every worktree `prepare` returns is released: `push` releases the one it pushes, and `release()` of the worktree releases it on any other outcome. Adapters: `repo` and `fixture`. Only the `jsonl` adapter of `store` writes `store/knowledge.jsonl`: landing opens it on the worktree and calls `append`. Landing takes time and ids only from the `clock` and `ids` ports. The ports of the ledger — `store`, `acts`, `git`, `clock`, `ids` — have no class of operations and are not recorded; what landing read is kept in the commit as `act` events, `at` and ids (TR-16). |
| LG-24 | If `main` moved, landing rebuilds the commit from the proposal on the new tail and pushes again, at most N times, a constant of the LATTICE version; then it ends `moved`. A proposal rejected on the new tail ends with its rejections, and the author rebuilds it. A conflict of code ends `conflict`; landing never resolves it. A forge merge queue may serialise landing; it is never required. |
| LG-25 | Landing ends `commit`, `no-op`, `rejections`, `moved` or `conflict`. A `no-op` makes a git commit without a `knowledge` commit that removes the proposal file, with the code changes of the change request if it has any. Landing a proposal whose hash is already in the ledger returns that commit (LG-12). |
| LG-26 | `land --dry-run` does everything but push, on a local tail or on the tail of `main`, with or without acts. It ends `commit`, `no-op` or `rejections`, with the list `awaiting-act`; it never ends `moved`, and a change request whose code conflicts with `main` is also reported as `conflict`. A missing act that an act requirement needs (TR-04, TR-42) is reported in `awaiting-act`, never as a rejection; every other rejection is reported as one. Dry-run computes `after` as if every awaited act had arrived and reports only the rejections that remain. Its report lists, per intent, the evolution class, the references removed and the fields changed, and the dismissed findings the gate passed over (DP-24). |
| LG-27 | Landing writes only to git. The `postgres` store follows git: the store command `sync`, or opening the store, appends the commits it has not seen with their deltas and evidence, and verifies that its chain equals the git chain. A commit is never written to `postgres` first. |
| LG-28 | CI lands a proposal when an act arrives on its change request, or when every intent of it is covered by delegation with a counted run (TR-18), in a `machine` session `land` whose key the policy lists (TR-10). A project with forge `none` (TR-41) is landed locally by its owner, in a `machine` session. Landing issues the id of its step and records the step (OB-02) when the runtime store is reachable; the path from its records to a reason lies in `knowledge` — through the land session and the proposal's session — and never depends on that step. |
| LG-29 | Contract tests of landing on the `fixture` adapters of `git` and `acts`: a dry run without acts reports `awaiting-act`; landing makes one git commit with the code, the jsonl append, the evidence, the removed proposal and the trailers; a moved `main` rebuilds, and after N tries ends `moved`; a changed expected revision ends with rejections; a code conflict ends `conflict`; a no-op; landing one hash twice returns the same commit; the landing commit is a merge whose second parent is the head of the change request and holds the regenerated `docs/`; a proposal covered only by delegation lands without an act. |
| LG-53 | Landing and `land --dry-run` run the LATTICE version that the project namespace pins in `before` (LG-44), never code of the change request. |

## Evidence

| ID | Rule |
|---|---|
| LG-30 | A run cited by `knowledge` is published as **evidence**: the whole `runtime` stream of the run — its run record and its tape with every answer in full — as a file `store/evidence/<hash>.jsonl`. The store command `cite` writes it into the change request. The evidence a proposal cites is the files of the runs its intents reference (RF-03); apply verifies it when the citing commit is admitted; it stays in git after landing and every adapter of `store` keeps it (LG-02). Only cited runs enter git, and a cited run replays from git alone. |
| LG-31 | A `runtime` record has no weight in `knowledge` until it is cited: it counts for no calibration, verdict or finding. |
| LG-32 | The formats of the run record and of the tape are known only to the module `evidence` (ST-01). `encode(run) → bytes` serves recording and `cite`. `decode(bytes) → run` verifies the hash of the file, the chain of its stream and the signature of every commit by the key in its session's certificate (LG-07) and returns the run typed: `pipeline@n`, `setup@n`, input and fingerprint, execution tuple, knowledge commit, stage outcomes, outcome, output, tape answers with their mode and model (RT-23), spending. `compareTuples(a, b, except?) → same \| differs(aspects)` serves reports (BN-13), regressions (BN-16) and replay (RT-16). |
| LG-33 | Tests of `evidence`: `decode(encode(run))` gives back the same bytes; a changed byte or a broken chain fails `decode`; `compareTuples` per aspect. Tests of admission: for each condition of the gate (DP-24 (0)–(7)), of a report (BN-13), of the live closure guard (DP-30), of a calibration (DP-25) and of delegation (TR-18) a fixture that meets it and one that does not. A broken signature fails `decode`; a run whose session is not a runner session counts for no admission. |

## Projections and read views

| ID | Rule |
|---|---|
| LG-34 | Current revision, referrers, uniqueness, standing (TR-25) and git links (OB-09) are **projections**: computed from the ledgers, never a source of truth, dropped and rebuilt at will. Findings and signals are computed on demand by checks over a read view (TR-35, OB-11) and are never stored. |
| LG-35 | One pure function, **fold**, holds the meaning of every projection: `fold(view, commit, evidence) → delta`, where `evidence` is the evidence files the commit cites; fold decodes them through the module `evidence` (LG-32), and a file that does not decode is folded as no run. A **delta** is the set of rows that one commit opens and closes. A row is canonical JSON (KR-10) with `from` and `to`, the `seq` that opened and closed it; `to` is `null` while it holds. Fold lives in the ledger and calls the pure rules of trust. It uses no clock, no ids and no order of parallel traversal; its meaning is code of a LATTICE version. |
| LG-36 | Fold is total: it rejects nothing. A dangling reference or a duplicate is folded as it is; rejecting is the work of apply (LG-14, LG-16). |
| LG-37 | Folding every commit from genesis gives the same bytes as the rows accumulated commit by commit. CI and a nightly job check it on every store. |
| LG-38 | A **read view** answers questions at one `seq`: `seq`; `current(id)`, `latest(id)` and `revision(id, n)`, which return the record (TR-22); `referrers(target, label?)`; `holder(unique key)`; `standing(ref)` (TR-25); `tuple(pipeline@n, setup@m)` — the execution tuple the ledger determines for the pair: the code hashes of the implementations and adapters the setup binds, their executors and port modes, the `judge@n` of each point the pipeline pins with its model, the LATTICE version and the library pins (RT-14); `blocks(types, namespaces)`; `evidence(run id or hash)` — the bytes of cited evidence. `view(seq)` is the rows with `from ≤ seq` and `to` `null` or greater. Apply, the runtime (RT-17), capabilities and checks ask only these questions; rows are never seen by them. |
| LG-39 | Tests of fold and views: a rebuild equals the accumulated rows; every question of the view on the `memory` store; fold is total on the commits apply rejects; for every admitted fixture, `after` of apply equals `view(seq)` of the store after landing; the fixtures of every rule ID run on the `memory` store. |
| LG-40 | The `runtime` ledger has a read view built by the same mechanism; its fold is code of the ledger too. Its projections — git links (OB-09), the state of delivery intents (RT-26) — are defined where they are used. |
| LG-52 | A `runtime` commit is admitted by the phases Record and Schema of apply and by the signature, expiry and role checks of Authority (LG-16): the certificate of its session has not expired at the time the store assigns to the append (TR-11), and the role of its session may write the type of each record (TR-08, PR-20). A human input to `runtime` — an answer to a question, an approval of a delivery intent, an acknowledgement of a signal — is an `act` event (TR-14) that the store command `act` reads through the `acts` port and appends. |
| LG-41 | The ledger offers a feed of commits by `seq` and a read view as of any `seq`. Materialisations of a domain — valid-time views, anchor models, catalogues — are consumers of the feed, never projections of LATTICE. |

## Codec

| ID | Rule |
|---|---|
| LG-42 | One codec module holds the `md` format (RM-Z03): import (`md` → proposal) and export (blocks → `md`). Export is canonical — one blank line between blocks, tables with a `\|---\|` separator, headings by level — and import rejects `md` that is not canonical, so import followed by export gives the same bytes. Mapping: |

| `md` | Block |
|---|---|
| a table with IDs | each row a block of type `clause`; its `cells` hold the columns in order as `{column, text}`, `column` the slug of the header |
| a table or list attached to a block | a field `table` (`{header, rows}`) or `list` of that block |
| IDs mentioned in text | a field `refs`: floating references, label `about` |
| a section | a `section` block: `heading`, `level`, and `items` — references to its blocks and subsections in order, and the header of each table it holds |

| ID | Rule |
|---|---|
| LG-43 | After the switch (SL-03) `md` is export only. Landing writes `docs/` from the new tail into the landing commit (LG-22); CI regenerates `docs/` from the ledger and compares bytes; a hand edit fails CI. `gen/` is not kept in git (ST-08). The store command `import-md` runs once, at the switch, and one owner act on its proposal hash admits every type and block it creates. |

## Libraries

| ID | Rule |
|---|---|
| LG-44 | A **library** is one or more namespaces with their own ledger and code, shipped as an npm package that carries the code and the ledger. The project namespace pins, in its body, the LATTICE version — which fixes `std` — and every library it uses, by name, version and hash. A pinned library is visible read-only (RF-01). A library never depends on a project; dependencies between libraries have no cycles. A namespace name is unique in the set a project sees; a conflict is rejected. A library's namespaces carry its owner's prefix. |
| LG-45 | The read view of a project composes its own fold with a read-only fold of every pinned ledger — `std` and each library — at its pinned version. The fold of a library is computed when its package loads and cached in `.lattice/` under the hash of its ledger and the LATTICE version; a package ships its ledger with the evidence it cites, never rows. |
| LG-46 | A library or `std` is updated by the store command `upgrade`: a proposal with a new revision of the project namespace that pins the new version, in a `machine` session with purpose `init`, admitted by an owner act. The ledger of the new version must extend the pinned one — its chain starts with every commit of the pinned version — or the upgrade is rejected. Before the act `upgrade` reports every row of standing that the fold of the new version changes. A `live` pair whose tuple the upgrade changes falls under the live closure guard (DP-30). |

## Genesis and versions

| ID | Rule |
|---|---|
| LG-47 | Store init writes three commits: (1) genesis — the meta-type and the session type, written by ledger code in a genesis session with `at` `1970-01-01T00:00:00.000000Z` and a session `id` that is a constant of the kernel version, so the genesis hash is that version's constant; (2) the project namespace with its owner and pins from the init configuration (TR-01, LG-44) — in the ledger of `std`, its namespace `std/namespace` with the type of that record, `std/namespace-policy`, and every type it reaches by `extends` and `$ref` (LG-18); (3) `setup@1` with no bindings. All three reach git through landing (LG-22) with acts of the `init` adapter (TR-14) and the exemptions of LG-18; in genesis the genesis session is also the land session, so its hash stays constant. |
| LG-48 | The hash of a library's ledger — `std` included — is a constant of its version, verified when the package loads and when a store opens. |
| LG-49 | A new kernel version appends a transition commit; older records stay valid under the kernel they were written with. History is never rewritten. |
| LG-50 | Paths: `store/knowledge.jsonl`, `store/proposals/`, `store/evidence/`, `store/lattice.json` — the init configuration and where the store and the library packages are; `docs/` (export, written by landing), `src/` and `test/` (code). `gen/` (generated on demand, ST-08) and `.lattice/` — local state: bindings, caches, folds of libraries — are ignored by git. |
| LG-51 | CI checks a change request only by LATTICE commands: (1) `land --dry-run` on the tail of `main` with acts read through the `acts` adapter — a rejection fails the check, `awaiting-act` alone passes it and lists the acts awaited; (2) `docs/` equals what the ledger generates; (3) the fitness tests pass (ST-12); (4) every commit carries its trailers (OB-07), each trailer resolves — the session exists, its certificate verifies and its `for` is `Lattice-Reason` — and the commit changes only paths its role owns (AG-08); (5) in a runner session (TR-43) CI runs `std/verify` for every `implementation` and `test-set` revision of the proposal and cites the runs into the change request. CI holds no logic of its own. |
