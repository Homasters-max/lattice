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
| 9 | What fields does a rejection of apply carry? | lattice/lg-17 | normal | S0-02 | 2026-10-06 |
| 10 | In what format is the path of a rejection written? | — | blank | S0-02, G-13 (LG-17 называет поле, но не формат) | 2026-10-06 |
| 11 | Which module may receive the judge port? | lattice/dp-14, lattice/st-04 | normal | S0-03 | 2026-10-06 |
| 12 | What may an adapter import? | lattice/st-01 | normal | S0-03 | 2026-10-06 |
| 13 | Who fills the prev hash of a knowledge commit, apply or landing? | — | blank | S0-03, G-14 (LG-06 называет поле, LG-14 и LG-38 не дают apply hash tail) | 2026-10-06 |
| 14 | May the cli import the codec module directly? | lattice/st-01, lattice/st-06 | normal | S0-03, G-15 (строки расходятся) | 2026-10-06 |
| 15 | Which kernel version do commits carry before the switch? | lattice/kr-03 | normal | S0-03 | 2026-10-06 |
| 16 | Does a store adapter compute the canonical bytes of the commits it writes? | — | blank | S0-03, Q-09 (LG-02 и LG-23 молчат; решено в CONVENTIONS.md: ledger отдаёт строку) | 2026-10-06 |
| 17 | Which store does landing read the before of apply from — the tail of main or the change request merged into it? | lattice/lg-14, lattice/lg-23 | normal | S0-03, ревью волна 2 | 2026-10-06 |
| 18 | How does landing end for a change request that does not exist? | — | blank | S0-03, Q-16 (LG-25 и LG-54 молчат; решено: отказ LG-54) | 2026-10-06 |
| 19 | Must the code of another project that LATTICE imports be pinned to one version? | lattice/st-04, lattice/pr-13, lattice/lg-44 | normal | S0-03, ревью волна 2 | 2026-10-06 |
| 20 | How does landing end for a change request whose proposal has no intents? | lattice/lg-54, lattice/lg-25, lattice/lg-12 | normal | S0-03, ревью волна 3 | 2026-10-06 |
| 21 | How does landing end for a change request that edited store/knowledge.jsonl when main has moved and the merge conflicts at that file? | — | blank | S0-33, Q-28 (LG-23 и LG-24 молчат; решено: отказ LG-23) | 2026-10-07 |
| 22 | From which root is the path of a rejection of landing counted? | — | blank | S0-33, Q-29 (G-13 — «от корня входа», вход landing не назван; решено: дерево change request) | 2026-10-07 |
| 23 | Is the integer 2^53 itself admitted into the canonical form? | — | blank | S0-04, G-20 (KR-10 «outside ±2^53» не говорит о границе; I-JSON и RFC 8785 — до 2^53−1; решено: нет, только \|x\| ≤ 2^53−1) | 2026-10-07 |
| 24 | Does a date-time admit a leap second? | — | blank | S0-04, G-21 (KR-11 задаёт написание, но не диапазон; решено: нет) | 2026-10-07 |
| 25 | Which numbers does the canonical form refuse? | lattice/kr-10 | normal | S0-04 | 2026-10-07 |
| 26 | Is the type of a record a floating or a pinned reference? | lattice/kr-07 | normal | S0-05 | 2026-10-07 |
| 27 | May the revision number in a pinned reference have leading zeros? | — | blank | S0-05, G-12 (KR-23 называет `id@n`, но не грамматику `n`) | 2026-10-07 |
| 28 | Must an external link of format uri have a scheme, and may it carry a fragment? | — | blank | S0-05, G-06 (KR-24 — «absolute URI», а RFC 3986 `absolute-URI` без фрагмента) | 2026-10-07 |
