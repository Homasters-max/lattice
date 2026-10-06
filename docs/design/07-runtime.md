# 07. Runtime

RT-Z01. How behaviour runs: pipelines of stage contracts, `setup` that binds implementations, runs and their records, recording of ports, delivery of writes, execution. LATTICE says what runs and records it; implementations say how.

## Pipelines

```json RT-Z02
{ "type": "std/pipeline@1", "id": "lattice/solve",
  "bench": "lattice/solve-set@1", "targets": { "hit@10": 0.95 },
  "stages": [
    { "stage": "std/lens.candidates@1", "params": { "pool_max": 200 },
      "reads": ["need"], "writes": ["pool"] },
    { "stage": "std/decide@1", "params": { "point": "lattice/lens-rank@1" },
      "reads": ["need", "pool"], "writes": ["selection"],
      "on": { "unavailable": "refuse" } },
    { "stage": "std/lens.expand@1", "reads": ["need", "selection"], "writes": ["answer"] } ] }
```

| ID | Rule |
|---|---|
| RT-01 | A **pipeline** is an entity: an ordered list of stages, the bench set it is measured on (`set@n`) and its `targets` per metric (BN-12). A stage pins a `stage` contract revision and gives it static `params`. A pipeline never names an implementation; `setup` binds them (RT-10). A run may name any pipeline revision by pinned reference; only the pair of a `live` fact drives execution (DP-21). |
| RT-02 | Params are validated against the contract's `params` type when the pipeline is validated, before any run. Anything that varies per run is a context field. |
| RT-03 | Data flows through a **run context** of named fields. A stage declares `reads` and `writes`. Validation checks that every field read was written earlier, that no field has two writers, and that run input fields are written by no stage. At run time the fields a stage changed must be a subset of its `writes`, or the stage fails. The context carries references and metadata, never bulk data: data stays in its own system and is reached through ports. |
| RT-04 | Branching is only `on: {status: action}`, and every status named must be one the stage contract declares. Actions: `continue`; `fallback: <stage@n>` — one alternative stage run in place, which writes the same fields; `escalate` — end the run with a question (RT-18); `refuse` — end the run with a refusal. A status that is not named in `on` and is not a success — `ok`, or `selected` for `decide` (DP-08) — ends the run with that status. |
| RT-05 | No backward jumps and no loops. A fallback stage has no `on` of its own. A pipeline is linear; running one step over many items is the caller's work: one run per item, each linked to the caller's step (AG-05). |
| RT-06 | Stages are coarse: one stage per step a person would name. |

## Contracts at run time

| ID | Rule |
|---|---|
| RT-07 | An implementation receives its input, its params, the ports its stage contract lists in `uses`, and always the `clock` and `ids` ports and the read view (RT-17). It receives nothing else. Only the implementation of `decide` receives the `judge` port (DP-14). |
| RT-08 | Every operation of a runtime port has one class: `read` (reads the outside world), `write` (changes it), `llm` (generates with a model), `irreversible` (a change that cannot be undone). The class set is closed; the set of ports grows as data. The ports of the ledger have no class (LG-23). |
| RT-09 | A stage that uses an `llm` operation declares only the default statuses `ok` and `unavailable`, so no branch depends on model output; pipeline validation checks it. The one exception is `decide`, whose statuses come from policy evaluation over judge answers (DP-08); the operation of the `judge` port has class `llm`. A thrown error or a broken contract is not a status: the run ends with outcome `error`. |
| RT-33 | Pipeline validation marks every context field written by a stage that uses an `llm` operation, and every field written by a stage other than `decide` that reads a marked field. A stage other than `decide` that reads a marked field declares only `ok`, `unavailable` and `invalid` — a field it read failed its schema. So no branch depends on model output except through `decide` (DP-14). |

## Setup

| ID | Rule |
|---|---|
| RT-10 | **`setup`** is a behaviour block. For each stage contract revision a pipeline uses it names one implementation whose `contract` is exactly that revision. For each port it names the adapter implementation, the mode — `service`, `recorded` or `fixture` — and whether memoization is on (the default; off only to measure noise, BN-15); for the `judge` port it names only the mode and memoization, because each point pins its `judge@n` (DP-10). For each implementation it names the executor (RT-31). A run names its `setup` (`lattice run --setup`); which pair drives execution is decided by the `live` fact of the pipeline (DP-21). |
| RT-11 | A pair admitted by a `live` fact binds an implementation only with evidence of an `ok` run of `std/verify` (RT-21) in a runner session (TR-43), on a `test-set` of the same contract revision against the exact code hash of the implementation, or by delegation (TR-18); every port of its setup is in mode `service`. Apply checks it in admission (LG-21). |
| RT-12 | The code hash of an implementation covers its module and every file it imports transitively, with line endings normalised to LF, except the generated files under `gen/`, which the contract revision it pins and the LATTICE version determine (ST-08). A script generates the manifest of hashes; a test checks it against the code; the runtime refuses an implementation whose code does not match. |
| RT-13 | **Bindings** are local configuration: endpoints and keys, written as `{"$env": "NAME"}`. Whatever can change a result or a cost for the same ledger belongs in the ledger — `setup`, stage params, `judge` blocks; bindings hold only what never does. Start-up checks run in phases and stop at the first refusal, naming the phase, the field and the rule ID (ST-17): (1) configuration schema, a secret literal refused; (2) open the stores and verify their chains; (3) `setup` — hashes of implementations and adapters, exact model ids in stage params and `judge` blocks; (4) bindings — every port has an endpoint and a key. |

## Runs

| ID | Rule |
|---|---|
| RT-14 | A **run** is one `runtime` stream: its tape entries are appended as the answers arrive, and its run record — one event whose `id` is the run's — closes it. The record holds `pipeline@n`, `setup@n`, the input and its fingerprint `sha256(canon(input))`, the **execution tuple** — the code hashes of every implementation and adapter, each `judge@n` with its model, each executor, the mode of each port, the LATTICE version and the library pins — the knowledge commit it read, its budget and spending, the outcome of every stage, and the run outcome. An adapter of the `llm` or `judge` port that cannot report which model answered records its own version in the tuple; such an adapter never serves a `live` pair (RT-30), so the tuple of every run of a `live` pair has the members LG-38 lists. The environment (runtime version, ICU) is recorded beside the tuple, not in it. The record is written through the module `evidence` (LG-32). |
| RT-15 | The run outcome is the status of the last stage, or `escalated`, `refused`, `error`, `budget-exceeded`, `cancelled`. A run that stops early is closed with its tape up to the stop and no partial output. A run stream that is never closed is a run without outcome and raises a signal (OB-11). A run in which a fallback ran says so in its outcome and in its output. |
| RT-16 | **Replay** runs the recorded input on the `recorded` adapters, ignoring `setup`: the same input, execution tuple and tape give the same outcome. A missing recorded answer is an error, never a call to the service. Replay writes nothing and reports the first stage whose outcome differs; a run whose code no longer exists replays as `code-changed`, found by `compareTuples` (LG-32). The code of a run is found through the implementation revisions of its `setup@n` and the landing commit of each (`Lattice-Seq`, LG-22). |
| RT-17 | Stages read `knowledge` through a read view (LG-38) at the knowledge commit of run start. It is not a recorded port: the commit in the run record makes the reads reproducible. Stages never read `runtime`: state that outlives a run lives in an outside system reached through a port. |
| RT-18 | No run is ever suspended. `escalate` ends the run with outcome `escalated` and a `question` event. A human's answer is an `act` with verb `answer` (LG-52). Continuing is a new run with the answer as input and a reference to the previous run; if its execution tuple differs, the question is asked again. |
| RT-19 | A run has a **budget** — `ms`, `tokens`, `usd`, number of calls — given by the caller and capped by the namespace policy (TR-02). The runtime counts spending from the tape; when the budget is spent the run ends `budget-exceeded`. |
| RT-20 | Implementations are deterministic: time, ids, judge, models and the outside world come only through ports. A structure test forbids clocks, randomness, environment, network and file access outside `adapters`, `assembly` and `cli` (ST-04). |
| RT-21 | A run of a test set is a run of the `std` pipeline `verify`: input `(test-set@n, code)` — the test set, which pins the contract revision, and the `code {module, hash}` (TY-11) of the implementation under test, which need not be in the ledger yet; one stage that runs the tests of the test set against that code through the executor (RT-31), statuses `ok` and `failed`. Its execution tuple holds the code hashes of both. |
| RT-34 | Tests of runs, on the `memory` store and `fixture` adapters: a run closes its stream with its record, and its stages read the view at the knowledge commit it names; replay of a recorded run gives the same outcome, a changed tape answer is reported at the first stage whose outcome differs, and a run whose code is gone replays as `code-changed`; a missing recorded answer is an error; spending past the budget ends the run `budget-exceeded`; `escalate` ends it `escalated` with a `question`, and a continuation whose tuple differs asks the question again; a fallback is named in the outcome and the output; a `write` becomes a delivery intent with its idempotency key, and a run that is not authoritative creates no intent of an `irreversible` operation; for each condition of authority (DP-21) a run that meets it and one that does not. |

## Recording

| ID | Rule |
|---|---|
| RT-22 | One recording module wraps every port contract. Each port gets three modes from it: `service` (the real adapter), `recorded` (answers from tapes), `fixture` (answers written by hand, kept in git). Only the `service` adapter is written per port. One set of contract tests per port runs against every mode. Recording knows no port by name. |
| RT-23 | The **tape** of a run holds every port answer keyed by `(operation, hash of request, occurrence)`, so concurrent calls replay correctly. An answer carries `ms`, `tokens` where known, `billing` — `api`, `subscription` or `local` — `usd` only for `api`, its `mode`, and `model: {id, check}` where `check` is `verified`, `reported` or `none`. Recording writes `mode` and `model` into the tape, never the adapter; the adapter only reports the model id and whether it checked it against the pinned one (DP-10). An adapter error is `{adapter, code, status?, retryable}`, never a vendor's body or headers; a rate limit is `retryable` and makes the stage `unavailable`. |
| RT-24 | **Memoization** is a lookup in earlier tapes, only for operations that declare `memo` (TY-10). The key is `hash(canon({port@n#operations/<op>, the values at the memo paths}))`; the code hash of the adapter is not in it, so a new revision of a port or a new `judge@n` never hits an old memo. Only answers with mode `service` in the runtime store of the project are sources; a memo answer keeps its mode and references the run it came from. `clock`, `ids` and reads are recorded for replay and never memoized. |
| RT-25 | Contract tests of recording on a synthetic port with `memo`: a hit; a miss when a value at a memo path changes; a miss on a new revision of the port; no memo without `memo`; `fixture` and `recorded` answers never serve memo; a memo answer keeps the mode of its source; `mode` and `model` on every answer. |

## Delivery

| ID | Rule |
|---|---|
| RT-26 | A `write` from a run is by default a **`delivery-intent`** event written in the run's stream: the operation, an idempotency key `hash(operation, input fingerprint of the run, hash of the payload)`, the hash of the payload and the stage that caused it. The caller delivers it after the run: before a delivery it checks that the run is authoritative in the current view (DP-21) and that every act the requirements on its operation need has arrived (TR-42), and it records a `delivery-attempt` `started` before the call and `done` or `failed` after it. Whether an intent is pending, delivered or failed is a projection of the runtime view (LG-40). |
| RT-27 | A `write` runs inside the run only when its operation is idempotent and a later stage needs its result. Its answer is on the tape; replay never performs it. |
| RT-28 | An `irreversible` operation is always a delivery intent. The caller delivers it only after an `act` with verb `approve` that names the intent (LG-52) and every further act that the requirements on its operation need (TR-42). A run that is not authoritative (DP-21) never creates one. |

## Models

| ID | Rule |
|---|---|
| RT-29 | The model of an `llm` operation is the static param `model` of its stage, an exact id; an alias is refused at start-up. Block text placed into a prompt is wrapped as data with its `ref@n`; references in model output must be a subset of the references in its input, checked by code; output is checked against its schema. A record derived from a run whose pipeline uses an `llm` operation is `inferred` unless a human acts on it (TR-20). |
| RT-30 | Adapters of the `llm` and `judge` ports include `claude-cli` and `codex-cli` (a subscription), `ollama` (a local model) and `ai-sdk` (vendor APIs such as DeepSeek and GLM). A point that drives a `live` pipeline, and the runs of a calibration (DP-25), use only adapters whose answers are recorded with `check: verified` (RT-23); subscription and local adapters serve `shadow`, development and the benches whose reports neither the gate nor a calibration counts. An `llm` adapter that cannot report which model answered never serves a `live` pair: the version it adds to the tuple (RT-14) fails DP-24 (3). |

## Execution

| ID | Rule |
|---|---|
| RT-31 | The **executor** is a port with adapters `inproc` — only for `std` and declared libraries — and `subprocess` — always for project implementations: a process with no environment, under the platform's permission model, reaching ports over IPC. `setup` chooses the executor per implementation within this rule, and the run records it. |

## Entry points

| ID | Rule |
|---|---|
| RT-32 | Every operation of a project that reads the outside world or decides is a pipeline run. The store commands are the one exception: they are the infrastructure below the runtime. The CLI is thin: `lattice run <pipeline> --input <file> [--setup <ref@n>]`, `lattice replay <run>`, and the store commands below. Nothing else holds logic. |

RT-Z03. Store commands:

| Command | Does |
|---|---|
| `init` | writes the first commits of a store (LG-47) |
| `draft` | writes intents into a proposal; never reads `md` |
| `land` | applies a proposal on the tail of `main`, makes the git commit and pushes it (LG-22); `--dry-run` checks without pushing (LG-26) |
| `sync` | brings the `postgres` store up to the git chain (LG-27) |
| `verify-store` | opens a store and verifies its chains and a rebuild of its rows (LG-37) |
| `export` | writes `docs/` and `gen/` from the ledger, or `gen/` from the `after` of a dry run |
| `import-md` | imports `md` once, at the switch (SL-03) |
| `cite` | packages whole runs as evidence into a proposal (LG-30) |
| `report` | computes the report of the cited runs of a split and drafts it into a proposal (BN-10) |
| `act` | reads an act through the `acts` port and appends it to `runtime` (LG-52) |
| `upgrade` | updates `std` or a library (LG-46) |
| `migrate` | drafts the new revisions a type revision needs (RF-13) |
| `rebind` | drafts implementation revisions for a new contract revision (RF-21) |
| `session` | starts a session and issues its certificate (TR-11) |
| `trace` | records a step or a git commit into `runtime` (OB-02, OB-08) |
