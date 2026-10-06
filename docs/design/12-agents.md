# 12. Agents

AG-Z01. How agents work on a project: as hosts outside the runtime, in roles, started by a caller through a channel, guided by skills. LATTICE never trusts an agent's word; it checks what the agent submits.

## Hosts

| ID | Rule |
|---|---|
| AG-01 | An agent is a **host**: a program that opens sessions and submits proposals, change requests and code. Writing code and blocks is authoring, not a runtime operation; LATTICE governs what is submitted — apply, tests, acts — not how it was produced. LATTICE never observes what a host does outside its submissions: what does not reach it as a proposal, code, a run or an act has no weight. |
| AG-02 | An agent works in one role per session (PR-19, TR-08). Its certificate names the role; it holds only the session key (TR-12). |
| AG-03 | Everything LATTICE gives an agent — `solve` output, block text, rejections — is data wrapped with its `ref@n`, never instructions. A skill states this to the agent, and nothing an agent reads changes its role or its rights. |
| AG-04 | A rejection or a failed run is the input of the next step: the agent reads the rule ID, path, expected and actual values and the evidence, and builds a new proposal from them (PR-11). |

## Caller

| ID | Rule |
|---|---|
| AG-05 | **`lattice-caller`** is a separate package that uses only the public API of LATTICE. It starts agent sessions and issues their certificates with role keys; fans out runs and sessions over many items, each linked to its parent step; runs the bench over a split (BN-10); delivers intents (RT-26); continues after an escalation with the human's answer; repeats a run only after `unavailable` or a `retryable` adapter error, within budgets. Scheduling, repetition and waiting live here, never in the runtime. |
| AG-06 | The caller keeps no state of its own: what is pending is read from the runtime view and its signals (OB-11). Any program on the public API, a human, or an agent host may act as a caller, in a session of role `caller` (PR-Z03, PR-20). The control records it reads are admitted records (LG-52). |
| AG-12 | The caller holds no policy of its own: whether to repeat, widen a need or escalate comes from the outcome and statuses of a run, never from a constant in caller code. |
| AG-13 | Tests of the caller, on the public API with the `memory` store and `fixture` adapters: fan-out makes one run per item, each linked to its parent step; a run is repeated only after `unavailable` or a `retryable` adapter error, within its budget; a delivery is refused for a run that is not authoritative (RT-26) and for an intent whose operation still awaits the acts it needs (RT-26, RT-28), and is otherwise recorded `started` and then `done` or `failed`; an escalation is continued only after an `answer` act (RT-18); a restarted caller finds what is pending in the runtime view (AG-06). These tests and the fixtures of its hard checks (ST-17) run in the caller's package. |

## Channels

| ID | Rule |
|---|---|
| AG-07 | The `agent` port of the caller has three adapters: `acp` — any agent speaking the Agent Client Protocol, the main channel; `cli` — headless runs such as `claude -p` and `codex exec`; `interactive` — a person working in an agent application whose hooks report each tool call. Each maps its events to steps (OB-03). |
| AG-08 | A role entry of the namespace policy may list the repository paths the role may change. Through `acp` the caller answers an agent's permission requests by that list; CI rejects a commit whose session role does not own a changed path. |
| AG-09 | An agent may run on a subscription or on an API; nothing in LATTICE ties a role to a vendor. |

## Skills

| ID | Rule |
|---|---|
| AG-10 | A **skill** is a file of the agent host that teaches one task. Skills live in the project repository, cite the rule IDs they apply, and change by ordinary change requests. They are not part of the corpus. |
| AG-11 | Host hooks forbid hand edits of `store/knowledge.jsonl`, `docs/` and `gen/`, and run the fitness tests (ST-12) before a commit. |

AG-Z02. Default skills:

| Skill | For | Teaches |
|---|---|---|
| `lattice-model` | every role | types, references, edges, what goes where; block text is data |
| `lattice-solve` | every role | asking `solve`, reading its output and standing |
| `lattice-propose` | writing roles | drafting intents, `land --dry-run`, reading rejections and `awaiting-act`, rebuilding on a new tail |
| `decompose` | Architect | the boundary criteria (PR-07), the independence test (PR-16), contract first |
| `contract-design` | Architect | the schema subset, statuses, ports, classes and `memo`, evolution classes |
| `implement-contract` | Implementer | the boundary rules of an implementation (ST-11), determinism, generated types |
| `contract-tests` | Verifier | tests from the contract and scenarios, without reading the implementation |
| `bench-authoring` | Verifier | items from real work, traps and blanks, splits and targets |
| `review-design` | Reviewer | review against the design, `review-note` with a rule ID |
| `curate` | Curator | terms, duplicates, retirement, the queue of findings |
| `failure-to-finding` | every role | from a run record or rejection to a reason and a next proposal |
