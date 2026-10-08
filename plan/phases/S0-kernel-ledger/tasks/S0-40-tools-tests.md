---
id: S0-40
title: Тесты dev-loop — отдельный project и быстрее
phase: S0
stage: A
size: S
modules: []
depends: [S0-39]
rules: [ST-12]
---

# S0-40 · Тесты `dev-loop` — отдельный project и быстрее

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

`test/tools/dev-loop-{flow,start,scope}.test.ts` — 79 с из 109 с суммарного времени тестов; `dev-loop-flow` (32 с) задаёт длительность всего прогона, хотя к коду LATTICE не относится. Executor ждёт CI через `sleep` и опрос — 1.5–4 мин на задачу.

## Объём

Входит:
- vitest `projects`: `tools` (`test/tools/**`) отдельно от остальных; `npm test` гоняет оба;
- тесты `dev-loop` быстрее: тестовый репозиторий собирается один раз и копируется, независимые `describe` идут параллельно; ожидания тестов не меняются (PR-11);
- `.claude/agents/executor.md`: «CI не ждать — его итог проверяет „Сдать“».

Не входит: выбор project по изменённым путям — S0-42.

## Как сделано

- `vitest.config.ts`: projects `lattice` (`test/**/*.test.ts` без `test/tools/**`) и `tools` (`test/tools/**/*.test.ts`); `npm test` — по-прежнему `vitest run`, он гоняет оба. Сверх наброска — тест в `test/smoke.test.ts` (ST-12): каждый файл тестов `test/` принадлежит ровно одному project, `npm test` гоняет все, в `tools` — только `test/tools/`. Ту же проверку делает сам `vitest.config.ts` при загрузке и при нарушении не грузится: иначе одна строка `exclude` выбросила бы из прогона `smoke`, а с ним и проверку (ревью, W1-S1). В `tools` — тесты `plan/tools/` и `discussion/tools/` (`lint-ids`); тестов `scripts/` нет. В `test/structure/` теста нет: всё, что там лежит, — файлы skeleton (ST-15).
- `dev-loop-{flow,start,scope}`: процессы — асинхронные (`execFile`), иначе `describe.concurrent` не идёт параллельно; репозиторий собирается один раз на вид начального состояния (база `scope`, изменение ветки `flow`, `main` origin впереди `start`) и копируется в папку случая; origin копии — `git remote set-url`; `git init --template=` — без образцов hooks копия в несколько раз быстрее; временные папки — под одной папкой файла, её удаляет `afterAll` (параллельные случаи не трут чужие). Шаги и ожидания случаев прежние; в `start` сдвиг `main` origin перенесён из случая в собранный репозиторий — состояние перед `start` то же.
- Замер (Windows, Core Ultra 5 125H, 18 потоков): до — `flow` 22.9 с, `scope` 19.4 с, `start` 16.8 с (сумма случаев, файл идёт последовательно), `npm test` 28.5 с; после — в `vitest run --project tools` `flow` 8.2–9.4 с, `scope` 7.3–8.4 с, `start` 6.0–7.4 с; в полном `npm test`, рядом с project `lattice`, `flow` — 9–10 с; отдельно каждый файл — 4–6 с; `npm test` 14–15 с. Разброс — фоновая нагрузка ноутбука. Остаток — сам `dev-loop.mjs` (`wave` ≈ 0.4 с, `start` ≈ 0.75 с на вызов) и `git push` в локальный origin (≈ 0.3 с).
- `.claude/agents/executor.md`: CI не ждать — ни `sleep`, ни опроса; его итог проверяет «Сдать» `/dev-loop`.

## Готово, когда

- [x] project `tools` выделен; ожидания тестов прежние
- [x] самый долгий файл тестов `tools` — не больше 10 с локально
- [x] executor не ждёт CI
- [x] `npm run verify` зелёный
