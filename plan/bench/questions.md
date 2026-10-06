# Вопросы для первого bench set

Журнал задачи [S0-31](../phases/S0-kernel-ledger/tasks/S0-31-bench-questions.md). Вопросы о дизайне, которые пришлось искать в реальной работе (BN-05, SL-08). Вопрос пишется на английском — это будущий вход `solve` (PR-14); всё остальное может быть на русском.

Ожидаемый ответ фиксируется сразу, до любого запуска `solve` (BN-05): блоки как `lattice/<id>` или «—», если ответа в дизайне нет. Виды: `normal`; `blank` — рядом с темой, но ответа в области поиска нет; `trap` размечается в S1 скриптом по доле общих слов (BN-01).

| # | Question | Expected | Kind | Источник | Дата |
|---|---|---|---|---|---|
| 1 | Which view does the Authority phase of apply read, before or after? | lattice/lg-16, lattice/tr-06 | normal | планирование S0 | 2026-10-06 |
| 2 | Can a type and blocks of that type be written in one commit? | lattice/lg-11 | normal | планирование S0 | 2026-10-06 |
| 3 | Who is allowed to write store/knowledge.jsonl? | lattice/lg-23 | normal | планирование S0 | 2026-10-06 |
| 4 | Which rules of the trust document are implemented after the first slice? | lattice/sl-z04, lattice/sl-07 | normal | планирование S0 | 2026-10-06 |
| 5 | How does a floating reference into a library resolve after the library is upgraded? | lattice/rf-02, lattice/lg-46 | normal | планирование S0 | 2026-10-06 |
| 6 | What entity id does a document section get when it is imported from md? | lattice/rm-z03 | normal | планирование S0, Q-02 → D203 | 2026-10-06 |
| 7 | Which participant's act admits the types of a library's own namespace when its ledger is initialised? | lattice/lg-18, lattice/lg-47 | normal | планирование S0, Q-03 → D204 | 2026-10-06 |
| 8 | Over which bytes is the body size limit counted? | — | blank | планирование S0, G-05 (KR-13 задаёт лимит, но не байты) | 2026-10-06 |
