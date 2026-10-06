# 11. Observability

OB-Z01. How every action is linked into one picture: why it was done, who did it, which steps it took, what it produced, and where it went in git. Nothing done through LATTICE is left without a path to its reason.

```text OB-Z02
reason (requirement | finding)
  └─ session {participant, role, for: reason}
       └─ step {kind, name, parent}            ← an action without a record of its own: skill, tool, land, cite, bench
            └─ produces → proposal → commit · run · delivery · git commit
```

## Chain

| ID | Rule |
|---|---|
| OB-01 | Every piece of work has a **reason**: a `requirement`, or a finding addressed by `{rule, subject}` (TR-34). A session names it in `for` (TR-11); a session with purpose `explore` names it later by a `link` event (TR-13); a session with purpose `init` has none. |
| OB-02 | A **step** is an event in `runtime`: `id` (ULID), session, `parent` step, `kind` — `skill`, `tool`, `land`, `cite`, `bench` — name, hashes of input and output, status, `ms`, `tokens`, `billing`. A step is recorded only for an action that has no record of its own: a run, a delivery attempt and an act are their own records, and the trace view shows them as steps (OB-13). Steps of one session form one chain (LG-07). |
| OB-03 | Steps come from the runtime (runs and store commands), from the caller (fan-out, deliveries, AG-05) and from agent channels: the events of an ACP session, the output of a headless CLI, the hooks of an interactive host (AG-07). The same step shape comes from every source. |
| OB-04 | When a channel reports it, a step records what an agent read: blocks by `ref@n`, files by path and content hash. |
| OB-05 | A step holds metadata in full. Texts — prompts, answers, file contents — are kept by hash as content of the `runtime` store (LG-02) and referenced from the step; a registered secret is never stored (LG-20). |
| OB-06 | Products link back to steps: the step that wrote a proposal records its hash, a `knowledge` commit names its proposal and its land session (LG-22), and a run record names its parent step. So every `knowledge` record reaches a reason inside `knowledge`: record → commit → proposal → session → reason, or record → commit → land session → reason. Landing adds a step when the runtime store is reachable (LG-28). The links point from `runtime` to `knowledge`, never back (RF-08). |

## Git

| ID | Rule |
|---|---|
| OB-07 | Every git commit carries the trailers `Lattice-Session`, `Lattice-Step` and `Lattice-Reason`. A commit hook and CI reject a commit without them, and CI rejects a trailer that does not resolve (LG-51). A landing commit names the session and reason of its proposal and the landing step (LG-22), so a line of code that came through landing reaches its author's session and reason. |
| OB-08 | The commit hook and CI run `lattice trace`, which writes one `code-commit` event per new git commit, keyed by its sha, so a second write is a no-op: sha, trailers, changed files with content hashes. The event survives a later rewrite of git history. |
| OB-09 | The projection `git-link` of the runtime view (LG-40) indexes the `code-commit` events, so a commit, a file or a line of code reaches its step, session and reason. |
| OB-10 | Generated files — `docs/`, `gen/` — carry a header that names the namespace they were generated from and says they are generated; it holds no `seq` or hash, so a landing changes only the files whose content changes. |

## Signals

| ID | Rule |
|---|---|
| OB-11 | A **signal** has the shape of a finding over `runtime`: `{rule, subject}`, its subject a `runtime` event `id`, raised only by a registered check named by its rule ID and computed on demand over the runtime view, never stored. Checks: a step or session with no path to a reason; an `explore` session closed unlinked (TR-13); a delivery intent pending beyond its deadline (RT-26); a delivery attempt `started` without an end (RT-26); a run stream never closed (RT-15); a failed or `budget-exceeded` run; an escalation without an answer; a Verifier session that read a file of the implementation under test (OB-04). A signal closes when its cause disappears or by an `act` with verb `acknowledge` naming `{rule, subject}` (LG-52). |
| OB-12 | Signals and findings are separate sets of checks. A signal has no weight in `knowledge` and never becomes a finding (LG-31); a finding check may read cited evidence. Tests of signals: for every check a fixture that raises it and one that does not; an `acknowledge` act closes a signal, and a `link` closes the signal of an unlinked `explore` session. |

## Views

| ID | Rule |
|---|---|
| OB-13 | From any record the whole picture is reachable through read views: its references and referrers, its trace up to the reason, and its git commits. No view keeps data of its own. The trace view shows runs, delivery attempts and acts as steps. |
| OB-14 | An OpenTelemetry export maps a session to a trace and a step to a span, for external viewers. It is a projection, never a source. |
| OB-15 | Tests of trace: the steps of a session form one chain; `trace` writes one `code-commit` per sha, and writing the same sha again is a no-op; `git-link` reaches a step, a session and a reason from a commit, a file and a line; the trace view reaches a reason from a step, a run, a delivery attempt and an act, and shows the last three as steps. |
