---
id: S0-33
title: Проверки landing до apply
phase: S0
stage: B
size: M
modules: [ledger]
depends: [S0-32]
rules: [LG-09, LG-17, LG-23, LG-24, LG-54, KR-10, ST-17]
---

# S0-33 · Проверки landing до apply

## Зачем

Архитектурный разбор S0-03 (2026-10-07, «Открытое» PR #5): проверки change request до apply выделены в чистые функции ради фикстур ST-17. `changeRequest` и `proposalPath` — по 2–4 строки. Само поведение живёт в склейке `landing.check`, которую фикстуры не видят:
- **Корни `path` в отказах одного `lattice land` смешаны** (G-13): KR-10 — `/store/proposals/<file>`, LG-09 — `/intents/…` без файла, строки store — `/0/seq`, индекс от 0 и без файла.
- **Исход порчи store зависит от `main`.** Change request, который сам правит `store/knowledge.jsonl`, при сдвинувшемся `main` кончается `conflict` merge, а не отказом LG-23. Если `main` не двигался, тот же change request получает отказ.
- **Порядок проверок** задан только порядком строк `check()` и не проверен.
- **Порты времени и id не показаны:** ни один тест landing не проверяет, что `id` land session и `at` коммита приходят из `ids` и `clock`.

## Объём

Входит:
- **Конфликт на файле store — отказ LG-23** (Q-28). Если среди путей `conflict` из `prepare` есть `store/knowledge.jsonl` или путь под ним, landing отклоняет change request LG-23, а не кончается `conflict`. Порт `git` не меняется.
- **Один корень `path`** у отказов landing (Q-29): от корня дерева change request. Файл — путь в дереве, дальше JSON Pointer внутри него: `/store/proposals/cr-x.json/intents/0/op`. Строка store — номер строки с 1: `/store/knowledge.jsonl/1/seq`. То же — при открытии store на tail (`openTail`, S0-32).
- **Проверка change request до apply — один модуль.** `changeRequest`, `proposalPath` и `keptKnowledge` уходят внутрь и пропадают из входа `src/ledger/index.ts`; с ними — `fileOnMain` из `src/ledger/tail.ts` (S0-32), когда её строка `tail` в `checks.ts` переходит на `land`.
- **Фикстуры через `land`** (`CONVENTIONS.md` §4 дописывается):
  - строки `checks.ts` для LG-54, LG-23 (`knowledge` и `tail`) и KR-10/LG-09 proposal прогоняют `land(…, {dryRun: true})` на `git-fixture`, собранном из `input.branches`;
  - раннер `test/fixtures/run.ts` становится асинхронным;
  - сырые деревья trigger разрешены решением Q-23;
  - строки `json`, `proposal` и `store` для KR-10, LG-06 и KR-04 остаются чистыми: склейки там нет.
- **Порядок исходов landing** (G-19): change request существует (LG-54) → store на tail открывается (LG-23, LG-06) → `conflict` (LG-24, LG-26; конфликт на файле store — LG-23 по Q-28) → proposal (LG-54, KR-10, LG-09) → байты store в change request (LG-23). Тест в `test/ledger/landing.test.ts` проводит change request, у которого несколько исходов, через каждую ступень, в том числе `conflict` на `main`, где store не открывается; тест S0-32 «LG-23: refuses a main whose store does not open before it prepares the change request, even one whose code conflicts with main» становится его частью.
- **Тест** в `test/ledger/landing.test.ts`: `id` land session и `at` коммита — из `ids-counter` и `clock-fixed`.

Не входит:
- пересборка на сдвинувшемся `main` (LG-24) — S0-20;
- новые rule ID.

## Интерфейс

Внешний интерфейс `land(ports, request, options)` не меняется. Меняются `path` отказов (Q-29) и исход для конфликта на файле store (Q-28).

## Шаги

1. Фикстуры переходят на `land` dry-run, раннер — асинхронный; новые trigger:
   - LG-23 — конфликт на `store/knowledge.jsonl` при сдвинувшемся `main`;
   - LG-09 и KR-10 — `path` от корня дерева.

   Красные.
2. Отказ LG-23 на конфликте файла store; корни `path` в `proposalOf` и при открытии store; чистые функции уходят внутрь.
3. Тест порядка исходов (G-19) и тест `ids` и `clock`.
4. `CONVENTIONS.md` §3 (корень `path` в landing) и §4 (фикстуры через `land`, асинхронный раннер).

## Тесты и фикстуры

- Переписываются фикстуры LG-23, LG-54 и KR-10 для proposal (`test/fixtures/{LG-23,LG-54,KR-10}/`) и ожидания `path` в KR-10, LG-06 и KR-04 для строк store.
- Новые trigger:
  - `LG-23/trigger/conflict-on-moved-main`;
  - `LG-09/trigger/…` с `path` от корня дерева через `land`.
- Fitness-тесты `coverage.test.ts` и `run.test.ts` остаются зелёными на асинхронном раннере.

## Готово, когда

- [ ] change request, который правит файл store, получает отказ LG-23 при любом положении `main`
- [ ] у всех отказов landing один корень `path`; строки store нумеруются с 1
- [ ] фикстуры LG-54, LG-23 и KR-10 proposal идут через `land`; `changeRequest`, `proposalPath`, `keptKnowledge`, `fileOnMain` вне входа `ledger`
- [ ] порядок исходов landing задан по G-19 и показан тестом, в том числе `conflict` на `main`, где store не открывается
- [ ] тест показывает `ids` и `clock` в коммите
- [ ] `npm run verify` зелёный

## Риски и заметки

- **Триггер ST-15:** правка `src/ledger/index.ts`. Отметка в PR.
- **Порядок задач:** S0-04, S0-05 и S0-10 пишут фикстуры с `expect.path`, поэтому корень Q-29 должен быть в `main` до них. Отсюда `depends` S0-04, S0-05, S0-06 и S0-25 на эту задачу.
