# S0 · доска задач

План фазы — [PLAN.md](PLAN.md). Здесь — итог задач: ⬜ не сдана · ✅ готово · ✖ отменена; итог и ссылка на PR приезжают вместе с merge ([статусы](../../README.md#статусы)). Что в работе — открытые PR (`gh pr list`), не больше трёх (SL-06). Готовые к старту задачи, критический путь и прогресс печатает `node plan/tools/plan-check.mjs`.

| Задача | Название | Этап | Статус | PR | Заметка |
|---|---|---|---|---|---|
| [S0-01](tasks/S0-01-repo-toolchain-ci.md) | Репозиторий, toolchain и CI-каркас | A | ✅ | [#1](https://github.com/Homasters-max/lattice/pull/1) | |
| [S0-02](tasks/S0-02-code-conventions.md) | Соглашения кода, отказов и фикстур правил | A | ✅ | [#3](https://github.com/Homasters-max/lattice/pull/3) | |
| [S0-03](tasks/S0-03-walking-skeleton.md) | Walking skeleton | B | ✅ | [#5](https://github.com/Homasters-max/lattice/pull/5) | G-14…G-18, Q-09…Q-27 |
| [S0-04](tasks/S0-04-canon-hash.md) | Canon, hash и канонические форматы | C | ⬜ | | |
| [S0-05](tasks/S0-05-record-ref.md) | Record и Ref | C | ⬜ | | |
| [S0-06](tasks/S0-06-schema-validate.md) | Schema — закрытое подмножество и validate | C | ⬜ | | |
| [S0-07](tasks/S0-07-type-compare.md) | Type и compare | C | ⬜ | | |
| [S0-08](tasks/S0-08-std-types-s0.md) | core и std — типы S0 как данные | D | ⬜ | | |
| [S0-09](tasks/S0-09-std-schemas-drafts.md) | Черновики всех схем std — проверка подмножества до заморозки ядра | D | ⬜ | | может перейти в SW |
| [S0-10](tasks/S0-10-proposal-commit.md) | Proposal и commit — форматы, hash, подписи, цепочка | E | ⬜ | | |
| [S0-11](tasks/S0-11-store-port.md) | Порт store — адаптеры memory и jsonl, контракт-тесты | E | ⬜ | | |
| [S0-12](tasks/S0-12-fold-view.md) | Fold, проекции, read view и verify-store | E | ⬜ | | |
| [S0-13](tasks/S0-13-apply-core.md) | Apply — каркас, кандидат, before/after, фазы 1–3 | F | ⬜ | | |
| [S0-14](tasks/S0-14-standing.md) | Standing — basis, in force, use, факты | F | ⬜ | | |
| [S0-15](tasks/S0-15-phase4-references.md) | Фаза 4 — ссылки, метки, фрагменты, memo, уникальность | F | ⬜ | | |
| [S0-16](tasks/S0-16-namespace-sessions.md) | Namespace, policy, участники, сессии, сертификаты и команда session | F | ⬜ | | |
| [S0-17](tasks/S0-17-phase5-authority.md) | Фаза 5 — полномочия, acts, floor и act requirements | F | ⬜ | | |
| [S0-18](tasks/S0-18-phase6-evolution.md) | Фаза 6 — эволюция типов и контрактов, identity, migrate | F | ⬜ | | |
| [S0-19](tasks/S0-19-acts-port.md) | Порт acts — адаптеры local, init, fixture, recorded | G | ⬜ | | |
| [S0-20](tasks/S0-20-git-landing.md) | Порт git и landing — land и land --dry-run | G | ⬜ | | |
| [S0-21](tasks/S0-21-draft-command.md) | Команда draft | G | ⬜ | | |
| [S0-22](tasks/S0-22-libraries-visible-set.md) | Библиотеки и visible set | G | ⬜ | | |
| [S0-23](tasks/S0-23-genesis-init.md) | Genesis, store init и команда init | G | ⬜ | | |
| [S0-24](tasks/S0-24-std-ledger.md) | Ledger std — воспроизводимая сборка и загрузка в проект | G | ⬜ | | |
| [S0-25](tasks/S0-25-codec-md-model.md) | Codec — модель md, разбор и канонический вывод | H | ⬜ | | ранняя дорожка после skeleton |
| [S0-26](tasks/S0-26-codec-import.md) | Codec — import md в proposal | H | ⬜ | | |
| [S0-27](tasks/S0-27-codec-export.md) | Codec — export blocks в md и команда export | H | ⬜ | | |
| [S0-28](tasks/S0-28-generate.md) | Generate — TS-типы, валидаторы и конфиг линтера из типов | H | ⬜ | | |
| [S0-29](tasks/S0-29-e2e-acceptance.md) | Сквозная проверка S0, CI и команда приёмки | I | ⬜ | | |
| [S0-30](tasks/S0-30-architecture-audit.md) | Архитектурный аудит S0 и ratchet | I | ⬜ | | |
| [S0-31](tasks/S0-31-bench-questions.md) | Вопросы о дизайне для первого bench set — сквозная задача | I | ⬜ | | идёт всю фазу |
