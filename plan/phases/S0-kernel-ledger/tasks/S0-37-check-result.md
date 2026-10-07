---
id: S0-37
title: Одна форма результата жёсткой проверки и одна грамматика rule ID
phase: S0
stage: C
size: S
modules: [kernel, ledger, codec]
depends: [S0-36]
rules: [LG-17, ST-17, RM-02]
---

# S0-37 · Одна форма результата жёсткой проверки и одна грамматика rule ID

## Зачем

Архитектурный разбор, волна 2 (2026-10-07), кандидат «таблица фикстур». Центральную таблицу `test/fixtures/checks.ts` (CONVENTIONS §4) разбор не пересматривает, но вокруг неё видно трение, которое снимается соблюдением уже записанного соглашения:
- **Три формы результата.** CONVENTIONS §2: жёсткая проверка возвращает `Result<T>`. Экспорты ядра `checkHeader`, `checkFormat`, `checkId`, `checkSchema`, `checkUri` и `ledger` `verifyChain`, `verifyProposal` возвращают голый `Rejection[]`; `canon`, `hash`, `parseRef`, `parseJson` — `Result`; `validate` — свой тип (KR-21, по §2 так и надо). Отсюда обвязка `refused(…) ?? { ok: true }` в 9 местах тестов и `as Commit` после проверки формы (`commit.ts:120`).
- **Разное место.** `checkHeader(value, path)` берёт голый `path`, `verifyChain` и `verifyProposal` — `path` отдельным аргументом, соседи — `Place`. `checkSchema` сортирует отказы, `checkHeader` — нет.
- **Грамматика rule ID написана четыре раза**: `src/codec/ids.ts` (RM-02), `RulePrefix` и `RuleId` в `src/kernel/rejection.ts`, `RULE_ROW` и свой сканер md с оградами в `test/fixtures/coverage.ts` (`designRuleIds`), `discussion/tools/lint-ids.mjs`.

## Объём

Входит:
- **`Result<T>` у каждой экспортируемой жёсткой проверки** `kernel` и `ledger` (CONVENTIONS §2): `T` — проверенное значение своего типа (`Record`, `Commit`, `Proposal`, проверенная схема), где оно есть; приведения типа после проверки (`as Commit`) уходят. Вход фазы 2 из S0-36 — так же. `validate` не меняется;
- **место — `Place`** у всех экспортируемых проверок, включая `checkHeader`, `verifyChain`, `verifyProposal`; отказы каждой проверки отсортированы (CONVENTIONS §5) — одно правило для всех;
- **обвязка `checks.ts`** — строки отдают `Result` проверки как есть; `refused(…) ?? { ok: true }` и литералы `{ intent: null, path: "" }` уходят в один помощник таблицы;
- **одна грамматика rule ID** — в ядре, рядом с `RuleId` (`rejection.ts`): правило, prose `Z`, «похоже на ID» (RM-02). `src/codec/ids.ts` берёт её оттуда; `designRuleIds` в `coverage.ts` становится «ID clauses из `parse` кодека над `docs/design`», её сканер и его тест удаляются.

Не входит:
- раздача строк `checks.ts` по модулям — CONVENTIONS §4 в силе;
- `discussion/tools/lint-ids.mjs` — инструмент `discussion/`, работает без сборки и до S0-01;
- неиспользуемые экспорты — их убирает опись S0-30, если к ней они не нашли вызывающего.

## Шаги

1. Тесты: каждая экспортируемая проверка возвращает `Result` с проверенным значением; `designRuleIds` над `docs/design` даёт тот же набор, что сейчас. Красные.
2. Сигнатуры ядра, затем `ledger`; вызывающие (`apply`, `commit`, `proposal`, `tail`, landing) и `checks.ts` переходят.
3. Грамматика ID в ядре; `codec/ids.ts` и `coverage.ts` берут её.

## Тесты и фикстуры

Новых rule ID нет; все фикстуры зелёные без правки. Тест покрытия (`coverage.test.ts`) видит те же rule ID дизайна, что до задачи.

## Готово, когда

- [ ] каждая экспортируемая жёсткая проверка `kernel` и `ledger` возвращает `Result<T>` и берёт `Place`
- [ ] в `checks.ts` нет `refused(…) ?? { ok: true }`
- [ ] грамматика rule ID — одна, в ядре; `coverage.ts` читает ID дизайна через `codec`
- [ ] `npm run verify` зелёный

## Риски и заметки

- **Импорт теста.** `coverage.ts` начинает зависеть от `codec`: тест покрытия ломается, если `parse` отклонит `docs/design`. Corpus-тест `codec` уже требует, чтобы весь дизайн разбирался, поэтому это не новое требование.
- **Три модуля** — триггер аудита ST-15. Правка `src/<module>/index.ts` по R9 не триггер.
- Задача идёт после S0-36: та убирает часть экспортов `check*`, и параллельная правка одних сигнатур нарушила бы PR-17.
