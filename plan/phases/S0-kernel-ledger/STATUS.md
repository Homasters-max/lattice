# S0 · доска задач

План фазы — [PLAN.md](PLAN.md). Здесь — итог задач: ⬜ не сдана · ✅ готово · ✖ отменена; итог и ссылка на PR приезжают вместе с merge ([статусы](../../README.md#статусы)). Что в работе — открытые PR (`gh pr list`), не больше трёх (SL-06). Готовые к старту задачи, критический путь и прогресс печатает `node plan/tools/plan-check.mjs`.

| Задача | Название | Этап | Статус | PR | Заметка |
|---|---|---|---|---|---|
| [S0-01](tasks/S0-01-repo-toolchain-ci.md) | Репозиторий, toolchain и CI-каркас | A | ✅ | [#1](https://github.com/Homasters-max/lattice/pull/1) | |
| [S0-02](tasks/S0-02-code-conventions.md) | Соглашения кода, отказов и фикстур правил | A | ✅ | [#3](https://github.com/Homasters-max/lattice/pull/3) | |
| [S0-39](tasks/S0-39-proof-loop-design.md) | Контур проверки — правки дизайна | A | ✅ | [#33](https://github.com/Homasters-max/lattice/pull/33) | инструмент, разбор #30, G-29 |
| [S0-40](tasks/S0-40-tools-tests.md) | Тесты dev-loop — отдельный project и быстрее | A | ✅ | [#34](https://github.com/Homasters-max/lattice/pull/34) | инструмент |
| [S0-41](tasks/S0-41-deterministic-tests.md) | Детерминизм тестов — seed и бюджет property-тестов | A | ✅ | [#35](https://github.com/Homasters-max/lattice/pull/35) | инструмент |
| [S0-46](tasks/S0-46-loop-timing.md) | Замер цикла в dl — время шагов и тонкий dl gate | A | ✅ | [#39](https://github.com/Homasters-max/lattice/pull/39) | инструмент, разбор циклов |
| [S0-47](tasks/S0-47-parallel-verify.md) | Параллельный verify — scripts/verify.mjs и кэши | A | ✅ | [#41](https://github.com/Homasters-max/lattice/pull/41) | инструмент, разбор циклов |
| [S0-50](tasks/S0-50-conventions-one-home.md) | CONVENTIONS — один дом каждой нормы | A | ✅ | [#40](https://github.com/Homasters-max/lattice/pull/40) | инструмент, разбор циклов |
| [S0-48](tasks/S0-48-minimal-brief.md) | Минимальный контекст — brief несёт всё нужное роли | A | ✅ | [#47](https://github.com/Homasters-max/lattice/pull/47) | инструмент, разбор циклов |
| [S0-51](tasks/S0-51-mechanical-steps.md) | Механические шаги в dl — старт и сдача задачи | A | ✅ | [#44](https://github.com/Homasters-max/lattice/pull/44) | инструмент, разбор циклов |
| [S0-42](tasks/S0-42-verify-levels.md) | prove — доказательство затронутого, ratchet ST-18 | A | ✅ | [#48](https://github.com/Homasters-max/lattice/pull/48) | инструмент |
| [S0-44](tasks/S0-44-mutate.md) | Мутации в prove --ready — выживших решает executor | A | ✅ | [#50](https://github.com/Homasters-max/lattice/pull/50) | инструмент |
| [S0-45](tasks/S0-45-review-evidence.md) | Ревью по hunk'ам — вердикт оси как evidence | A | ✅ | [#51](https://github.com/Homasters-max/lattice/pull/51) | инструмент, разбор циклов |
| [S0-43](tasks/S0-43-dl-gate.md) | Записи run'ов — ворота по ключам и shadow | A | ✅ | [#52](https://github.com/Homasters-max/lattice/pull/52) | инструмент |
| [S0-49](tasks/S0-49-fixture-pairs.md) | Фикстуры каждой пары «строка проверки × rule ID» | A | ✅ | [#45](https://github.com/Homasters-max/lattice/pull/45) | разбор циклов, в лимите SL-06 |
| [S0-52](tasks/S0-52-verify-meet.md) | Тест параллельного verify без 2-секундного окна | A | ✅ | [#46](https://github.com/Homasters-max/lattice/pull/46) | инструмент, нестабильный тест |
| [S0-03](tasks/S0-03-walking-skeleton.md) | Walking skeleton | B | ✅ | [#5](https://github.com/Homasters-max/lattice/pull/5) | G-14…G-18, Q-09…Q-27 |
| [S0-32](tasks/S0-32-open-tail.md) | Открытие store на tail main | B | ✅ | [#8](https://github.com/Homasters-max/lattice/pull/8) | разбор S0-03 |
| [S0-33](tasks/S0-33-landing-checks.md) | Проверки landing до apply | B | ✅ | [#10](https://github.com/Homasters-max/lattice/pull/10) | разбор S0-03, Q-28, Q-29 |
| [S0-34](tasks/S0-34-worktree-release.md) | Жизненный цикл worktree | B | ✅ | [#12](https://github.com/Homasters-max/lattice/pull/12) | разбор S0-03, Q-30, D206 |
| [S0-04](tasks/S0-04-canon-hash.md) | Canon, hash и канонические форматы | C | ✅ | [#15](https://github.com/Homasters-max/lattice/pull/15) | G-20, G-21 |
| [S0-05](tasks/S0-05-record-ref.md) | Record и Ref | C | ✅ | [#17](https://github.com/Homasters-max/lattice/pull/17) | G-06, G-12 |
| [S0-06](tasks/S0-06-schema-validate.md) | Schema — закрытое подмножество и validate | C | ✅ | [#19](https://github.com/Homasters-max/lattice/pull/19) | G-22, G-23 |
| [S0-07](tasks/S0-07-type-compare.md) | Type и compare | C | ✅ | [#22](https://github.com/Homasters-max/lattice/pull/22) | G-26, G-27 |
| [S0-35](tasks/S0-35-closed-form.md) | Закрытая форма объекта — одна функция ядра | C | ✅ | [#27](https://github.com/Homasters-max/lattice/pull/27) | разбор волны 2, Q-31, Q-32 |
| [S0-36](tasks/S0-36-record-against-type.md) | Запись против своего типа — один вход фазы 2 и чтение схемы | C | ✅ | [#28](https://github.com/Homasters-max/lattice/pull/28) | разбор волны 2, Q-33, G-28 |
| [S0-37](tasks/S0-37-check-result.md) | Одна форма результата жёсткой проверки и одна грамматика rule ID | C | ✅ | [#29](https://github.com/Homasters-max/lattice/pull/29) | разбор волны 2 |
| [S0-08](tasks/S0-08-std-types-s0.md) | core и std — типы S0 как данные | D | ⬜ | | |
| [S0-09](tasks/S0-09-std-schemas-drafts.md) | Черновики всех схем std — проверка подмножества до заморозки ядра | D | ⬜ | | может перейти в SW |
| [S0-10](tasks/S0-10-proposal-commit.md) | Proposal и commit — форматы, hash, подписи, цепочка | E | ✅ | [#21](https://github.com/Homasters-max/lattice/pull/21) | G-03, G-10, G-24 |
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
| [S0-25](tasks/S0-25-codec-md-model.md) | Codec — модель md, разбор и канонический вывод | H | ✅ | [#20](https://github.com/Homasters-max/lattice/pull/20) | G-25 |
| [S0-38](tasks/S0-38-md-model-tables.md) | Модель md с целыми таблицами — документ, который печатается обратно | H | ✅ | [#30](https://github.com/Homasters-max/lattice/pull/30) | разбор волны 2 |
| [S0-26](tasks/S0-26-codec-import.md) | Codec — import md в proposal | H | ⬜ | | |
| [S0-27](tasks/S0-27-codec-export.md) | Codec — export blocks в md и команда export | H | ⬜ | | |
| [S0-28](tasks/S0-28-generate.md) | Generate — TS-типы, валидаторы и конфиг линтера из типов | H | ⬜ | | |
| [S0-29](tasks/S0-29-e2e-acceptance.md) | Сквозная проверка S0, CI и команда приёмки | I | ⬜ | | |
| [S0-30](tasks/S0-30-architecture-audit.md) | Архитектурный аудит S0 и ratchet | I | ⬜ | | |
| [S0-31](tasks/S0-31-bench-questions.md) | Вопросы о дизайне для первого bench set — сквозная задача | I | ⬜ | | идёт всю фазу |
