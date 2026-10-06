# 09. LENS

LN-Z01. How blocks are selected for a need. `solve` is a pipeline; LENS is the decision pattern inside it.

```text LN-Z02
need → [translate] → candidates (BM25 + ids named in the need) → decide: rank → top-k + budget
     → expand by edges → decide: sufficient? → [{ref@n, card, why, trust}]
```

## Need

| ID | Rule |
|---|---|
| LN-01 | **`solve`** returns the blocks a consumer needs for a task. It is asked before anything new is proposed (PR-12): contracts and implementations are found the same way as knowledge, by listing their types in the scope. |
| LN-02 | A **need** is `{text, scope, budget}`: `text` in the corpus language, or translated by a recorded stage first (DP-29); `scope` (LN-03); `budget` — the **context budget** in characters and blocks, the run's one context budget field (DP-04). A need is run input, kept in the run record, never a stored entity. |
| LN-03 | `scope` lists types and domains inside the visible set. The default is every project namespace; `std` and library blocks enter only when listed, so they never crowd out project knowledge. |

## Candidates

| ID | Rule |
|---|---|
| LN-04 | `lens.candidates` is a stage contract. Its first implementation is BM25 over the card text of `blocks(scope)` (LG-38), computed in every run without a stored index: if the scope holds at most `pool_max` blocks (default 200), all enter the pool; otherwise the BM25 top `pool_max`. An index is never kept by the implementation (ST-11) and is not a projection; it enters only on its trigger (LT-23). |
| LN-05 | Blocks named by id in the need always enter the pool and are judged like any other; they are not `required`. A point alone declares `required`. |
| LN-06 | BM25 uses an English tokenizer with Porter stemming. The tokenizer is code of the implementation, covered by its hash; changing it is a new implementation revision that passes the bench and `shadow` before it drives a `live` pipeline. |
| LN-07 | Ranking reads the card (RF-10). Which fields form the card is data of each type; the bench measures it per kind of block (BN-07), and a change is a new type revision. |
| LN-08 | A second implementation of `lens.candidates` — such as local embeddings — enters only when the bench shows a gap in pool recall. Ranks of different sources are never fused: the pool feeds the judge. |
| LN-09 | Hints enter the pool only with an explicit `hint` label, never mixed silently. The pool lies inside the allowed set of `lens-rank`, which is the need's scope (DP-05). |

## Ranking

| ID | Rule |
|---|---|
| LN-10 | The point `lens-rank` is a `score` question with `score_semantics: relevance`, judged per candidate by a scorer (DP-11), with policy `top-k` and `budget`. |

## Expansion

| ID | Rule |
|---|---|
| LN-11 | After ranking, a deterministic stage expands along references from the selected blocks, within the budget and under the output rule (LN-15). Its params list the edge labels, the direction (references or referrers) and the depth, default 2. Without a list there is no expansion. Added blocks are marked `via: <ref>`. |
| LN-12 | The point `lens-sufficient` asks one `binary` question over the selection as one composite candidate: is this context sufficient for the need? It is judged by a model (DP-11). On `none` — the context is not sufficient — the run ends with that outcome, and the caller may run `solve` again with a wider need or escalate (AG-05). Until calibrated it runs only in `shadow` (DP-18). |

## Output

| ID | Rule |
|---|---|
| LN-13 | `solve` returns `{ref@n, card, why, trust}` items. `why` is `required`, the judge's score or `via: <ref>`. `trust` is the standing of the block (TR-25) with the verdict counts per basis (TR-33). A fallback and a non-authoritative run are marked in the output. Placed into a prompt, every item is wrapped as data with its `ref@n` (RT-29). |
| LN-14 | The full text of a block is requested separately by `ref@n`, under the output rule. |
| LN-15 | One output rule for every path of `solve` — pool, `required`, expansion, full text: a block whose use is not `in-use` (TR-26) is never given out as content. Named by id, it comes back as an item without a card, with its use: `retired` with its successors, one step; `alias` with its canonical `id`; `not-in-force`. |
| LN-16 | The context budget is counted in characters of card text, never in model tokens. A rough ratio to tokens is a stage param. |
