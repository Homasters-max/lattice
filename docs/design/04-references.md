# 04. References and evolution

RF-Z01. How references resolve, which edges a graph has, how a block changes identity, and how types and contracts evolve without breaking what pins them.

## Resolution

| ID | Rule |
|---|---|
| RF-01 | A reference resolves only inside the **visible set** of a project: its own namespaces, `core`, and the namespaces of the libraries it declares, at their pinned versions (LG-44). The read view of a project composes them (LG-45). A reference outside the visible set is rejected. A library never references a project. |
| RF-02 | A floating reference resolves to the current revision of its target (TR-22); a floating reference into a library resolves inside the pinned version of that library, so it changes only with an upgrade (LG-46). |
| RF-03 | The target of every reference, floating or pinned, exists in the view `after` of apply (LG-15) — in the tail or in the same commit; otherwise the write is rejected. A reference to a run is its run `id` (KR-23) and exists when evidence of that run is cited by the same commit or an earlier one (RF-08, LG-38). A future block is never referenced; its absence is a finding (TR-36). |
| RF-04 | A fragment (KR-23) must name a path that exists in the type of the target, and a map key that exists in its body; otherwise the write is rejected. |
| RF-05 | A floating reference to an alias resolves to its canonical entity; a pinned reference stays as written. A reference to an entity whose use is `retired` (TR-26) is a finding, not a rejection: earlier records legitimately point to what left use later. A `supersedes` reference raises no such finding. |
| RF-06 | An external link is a `format: uri` field with an edge label (KR-19). Its existence is never checked. Conventional schemes: `git:`, `https:`, `s3:`, `ducklake:`. |
| RF-07 | Every reference field and every external link carries an edge label from the `std` vocabulary (TY-16) or from the labels its namespace declares (TR-03); an unknown label is rejected. |
| RF-08 | `knowledge` references `runtime` only through cited runs, whose records are evidence in git (LG-30). `runtime` references `knowledge` by `ref@n` plus the knowledge commit hash. So the `knowledge` ledger in git resolves every reference it holds without the runtime store. |

## Graph

| ID | Rule |
|---|---|
| RF-09 | **Referrers** — the reverse index of every reference and every external link, from entities and events — is a projection (LG-34). It answers "who points here" for a block, an event, a commit or a URI. |
| RF-10 | A **card** is computed from one revision: the fields with `card_order` (KR-19), in that order, joined as text. It is never stored. It is the text of a block that ranking reads (LN-07). |
| RF-11 | A block of a `knowledge` type that no composition references is an orphan and raises a finding. |
| RF-23 | A floating reference whose fragment does not exist in the current revision of its target raises the finding "dangling fragment". |
| RF-24 | A floating reference with label `decides` or `verifies` raises the finding "target moved" when the current revision of its target landed after the revision of the referrer. |

## Identity changes

| ID | Rule |
|---|---|
| RF-12 | A block changes type, namespace, or is split or joined only by a new `id`: the new block lists in `supersedes` the pinned last revisions of what it replaces, and the old block gets a `retired` fact (TR-29). The successors of a block are read from referrers, one step, never stored. |

## Evolution of types

| ID | Rule |
|---|---|
| RF-13 | A new revision of a type is compared with the previous one (KR-22). If it is `same` or `wider`, existing blocks stay as they are. Otherwise apply validates every block in use (TR-26) under the new revision, and each invalid one must get a new revision in the same commit, or the commit is rejected. The store command `migrate` drafts those intents. |
| RF-14 | A new write uses the latest revision of its type. An existing block moves to a new revision of its type only by a new revision of the block. A stricter type or policy never blocks taking something out of use. |

## Evolution of contracts

| ID | Rule |
|---|---|
| RF-15 | Apply classifies a new contract revision by comparing it with the previous one: |

| Class | When |
|---|---|
| `same-shape` | only `presentation` differs (KR-22) |
| `consumer-compatible` | input and params are `same` or `wider`, output is `same` or `narrower`, no status is added, no port is added to `uses`; for a port no operation is removed or changed this way |
| `breaking` | any other change |

| ID | Rule |
|---|---|
| RF-16 | When meaning changed under the same shape, the author treats the change as breaking and gives it a new `id` (TY-08); a change apply finds breaking is never admitted as a revision. |
| RF-17 | Revisions of one contract `id` never break its consumers: a new revision is admitted only if it is `same-shape` or `consumer-compatible`. |
| RF-18 | A breaking change is a new contract `id` that lists the old one in `supersedes`. Both may live side by side, the new one in `shadow`; retiring the old one obeys the live closure guard (DP-30). |
| RF-19 | A new pin of a contract — by a pipeline, an implementation or a test set — names its current revision or a revision that a `live` pipeline pins; any other pin is rejected. The second case lets a fix reach production before its pipeline moves. |
| RF-20 | An implementation or a pipeline pinning a contract revision older than the current one raises the finding "behind". |
| RF-21 | The store command `rebind` drafts a new implementation revision that pins the current contract revision with the same code hash. A `live` pair binds it only with evidence of an `ok` run of `std/verify` (RT-11). |
| RF-22 | One impact function serves `migrate`, `rebind` and `upgrade`: the closure of the referrers of a changed target along the edge labels the command names (RF-09). Each command drafts intents per type from that closure; none keeps an index of its own. |
