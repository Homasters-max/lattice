---
id: S0-41
title: Детерминизм тестов — seed и бюджет property-тестов
phase: S0
stage: A
size: S
modules: []
depends: [S0-39]
rules: [ST-12]
---

# S0-41 · Детерминизм тестов — seed и бюджет property-тестов

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

Property-тесты берут случайный seed, а таймаут vitest 5 с — время машины: в #30 `codec/property` упал на windows под нагрузкой, fixer перепроверял прогон дважды. Результат, который не функция входа, нельзя переиспользовать (RT-21 после S0-39).

## Объём

Входит:
- setupFile vitest: `fc.configureGlobal({ seed })` из env `LATTICE_SEED`; без него — фиксированный seed, который печатается;
- бюджет каждого property-теста — `numRuns` и размеры генераторов; страховка по мс выше их с запасом;
- еженедельный workflow CI по `main` со случайным seed; упавший прогон печатает seed.

Уже сделано в S0-39 (решение владельца 2026-10-08): явный таймаут 30 с у `test/codec/model.test.ts` «LG-42: no file of src/ but src/codec/build.ts casts…», который валил `verify`; аудит остальных тестов на таймауте по умолчанию — здесь.

Не входит: вычисление seed из hash входа и исход `budget-exceeded` в записи — S0-42, S0-43.

## Как сделано

- `test/support/budget.ts` — `DEFAULT_SEED`, `SAFEGUARD_MS` и `seedOf(LATTICE_SEED)`; `test/support/setup.ts` (setupFile) — `fc.configureGlobal({ seed, baseSize: "small" })`; seed печатает один раз `test/support/global-setup.ts` (globalSetup): setupFile идёт в каждом файле тестов и печатал бы его десятки раз.
- Размер генераторов без явной границы задан глобально — `baseSize: "small"`, значение fast-check по умолчанию, теперь записанное; явные границы генераторов в тестах не менялись.
- `numRuns` дописан там, где его не было, со значением fast-check по умолчанию — 100: число случаев не изменилось (PR-11).
- `testTimeout` и `hookTimeout` vitest — `SAFEGUARD_MS` (30 с); явные таймауты 30 с у тяжёлых тестов остались и равны страховке, 120 с у `test/cli/bin.test.ts` — выше неё.
- `.github/workflows/explore.yml` — по понедельникам и вручную, ubuntu и windows, `npm test` со случайным `LATTICE_SEED`; упавший прогон печатает seed и как его повторить.

## Тесты и фикстуры

`test/support/budget.test.ts` — рядом с `budget.ts`, вне `test/structure/`, которой владеет skeleton (ST-15):
- seed прогона — `LATTICE_SEED` или `DEFAULT_SEED`; значение не 32-битное целое — ошибка, а не исправление; две выборки подряд равны;
- `globalSetup` из `vitest.config.ts` подключает `global-setup.ts`, и его `setup()` печатает `LATTICE_SEED=<seed>`; `setupFiles` подключает `setup.ts`, и `baseSize` генераторов — `"small"`;
- тест без своего таймаута получает `SAFEGUARD_MS`, а не 5 с vitest; `testTimeout` и `hookTimeout` в `vitest.config.ts` — оба `SAFEGUARD_MS`;
- ratchet (ST-16): каждый `fc.assert` и `fc.check` в `test/` называет `numRuns` и не ставит свой `seed`; trigger и pass — строки кода в самом тесте.

## Готово, когда

- [x] два прогона подряд дают одни и те же случаи
- [x] ни один тест не опирается на таймаут vitest по умолчанию
- [x] еженедельный explore-workflow есть
- [x] `npm run verify` зелёный
