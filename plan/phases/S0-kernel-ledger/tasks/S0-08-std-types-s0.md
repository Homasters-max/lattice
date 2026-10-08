---
id: S0-08
title: core и std — типы S0 как данные
phase: S0
stage: D
size: M
modules: [ledger]
depends: [S0-07, S0-36]
rules: [TY-01, TY-02, TY-03, TY-05, TY-06, TY-07, TY-11, TY-12, TY-13, TY-14, TY-15, TY-16, RT-10, TR-29, GL-01]
---

# S0-08 · core и std — типы S0 как данные

## Зачем

Типы — данные, а не код (PR-03, TY-02). Почти каждой задаче S0 нужны настоящие типы для фикстур: namespace и act — authority, `retired` и `alias` — standing, `clause`/`prose`/`example`/`section` — кодеку. Чем раньше они есть как проверенные данные, тем меньше фикстурных заглушек.

## Объём

Входит — исходники типов, проверенные ядром (без ledger `std`, он собирается в S0-24):
- **`core`** (TY-01): тип сессии `core/session` (поля TR-11: participant, kind, role, purpose, `for`, `parent`, software, version, certificate) — данные ledger-кода, который пишет его в genesis; мета-тип уже в ядре (S0-07);
- **базовые типы** TY-Z02 с полем `supersedes` (TY-03): `knowledge`, `composition`, `contract`, `implementation`, `behaviour`, `decision-point`, `hint` — abstract (G-02);
- **знания** TY-Z03: `requirement`, `scenario`, `decision`, `invariant`, `term`, `clause`, `prose`, `example`; поля кодека `refs`, `table`, `list` (G-01); `card_order` по колонке Card;
- **композиции** TY-05: `domain`, `section` (`heading`, `level`, `items`);
- **контракты и код** TY-06, TY-07, TY-11…TY-13: `stage`, `port` (операции с `class` и `memo`), abstract форма `code {module, hash}`, `implementation`, `judge`, `test-set`;
- **behaviour** TY-Z04: `setup` (RT-10 — как тип), `namespace-policy` (поля TR-02; Q-37), `quality-profile` (ST-09), `test-set`;
- **события**: `act` (TR-14), abstract форма `fact` (TY-14) с аннотациями `key`, status facts `retired`, `alias` (TR-29); формы `valid-period` (TY-15);
- **метки рёбер** TY-16 — как `labels` в политике namespace `std` (TR-03), а не как отдельный механизм.

Не входит: остальные типы `std` — `pipeline`, `decision-point` целиком, `bench-item`, `review-note`, `live`, `calibration`, `verdict`, `dismissed`, `report`, `source-listing`, события `runtime` (S0-09).

Где лежат исходники — `std/source/` (раздел 6 плана): одно тело типа на файл, имя файла — slug `id`.

Как сделано:
- тип `core/session` — константа `SESSION_TYPE` ledger-кода в `src/ledger/session-type.ts`, как мета-тип в ядре: genesis (S0-23) пишет его, не видя `std`;
- тип namespace — `std/namespace-policy` (`std/source/namespace-policy.json`; Q-37, D211): запись namespace `std` — `std/namespace`, и тип с тем же id был бы второй сущностью; тело этой записи с метками TY-16 — `std/namespace.json`: не тип, поэтому вне `std/source/`;
- примеры — `test/ledger/examples/std/<slug>.json` и `test/ledger/examples/core/session.json`: `valid` — тела записей, `invalid` — тело с путём и ключевым словом нарушения; тест — `test/ledger/std-types.test.ts`, test set `ledger` владеет `std/` (`scripts/paths.mjs`);
- имя формы `code` (TY-11) — слово, которое ядро писало в `parse.ts` как имя кодовой единицы: переменная переименована в `unit`, а аудит KR-01 не считает имена, которые объявляет платформа (`charCodeAt`, `fromCharCode`);
- пробелы — G-31…G-34.

## Шаги

1. Набросать типы в порядке зависимостей: формы → базовые → подтипы.
2. Тест: запись `core/type@1` с телом каждого типа проходит `checkAgainstType` (S0-36), цепочки `extends` сужают родителя, `card_order` уникален.
3. Тест: пример записи каждого не-abstract типа проходит `validate`; пример с лишним полем — нет.
4. Список имён типов `std` для теста KR-01 (S0-03) берётся из этих файлов: `test/structure/repo.test.ts` сейчас читает его функцией `stdTypeNames` из TY-Z02…TY-Z05 в `docs/design/03-types.md`.

## Готово, когда

- [ ] исходники всех перечисленных типов в `std/source/`, каждый проходит проверку ядра
- [ ] у каждого не-abstract типа есть валидный и невалидный пример
- [ ] тест KR-01 читает имена `std` из исходников
- [ ] решения G-01 и G-02 отражены в типах или пересмотрены с владельцем

## Риски и заметки

- `section.items` хранит и ссылки, и заголовки таблиц (LG-42): `composition` исключает свободный текст — заголовки таблиц считаются структурными метками; если схема этого не выражает, это пробел для раздела 12.
- Типы — данные `std`; ядро о них не знает (KR-01), их имена появляются только в `trust`, `ledger` и выше.
- От архитектурного разбора, волна 2 (2026-10-07): тела типов S0 проверяются одним входом фазы 2 из S0-36 — запись типа `core/type@1` против мета-типа с цепочкой `extends`, резолвер — тела типов по pinned ссылке; родитель с недопущенной схемой — отказ KR-15 (Q-33), а не исключение.
