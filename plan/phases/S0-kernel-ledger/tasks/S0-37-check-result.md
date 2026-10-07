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
- **`Result<T>` у каждой экспортируемой жёсткой проверки** `kernel` и `ledger` (CONVENTIONS §2): `T` — проверенное значение своего типа (`Record`, `Commit`, `Proposal`, проверенная схема), где оно есть; приведения типа после проверки (`as Commit`) уходят. Вход фазы 2 из S0-36 — так же. `validate` не меняется; строгий разбор (`decodeUtf8`, `parseJson`, `parseJsonBytes`) — тоже жёсткая проверка ядра и берёт `Place`;
- **место — `Place`** у всех экспортируемых проверок, включая `checkHeader`, `verifyChain`, `verifyProposal`; отказы каждой проверки отсортированы (CONVENTIONS §5) — одно правило для всех;
- **обвязка `checks.ts`** — строки отдают `Result` проверки как есть; `refused(…) ?? { ok: true }` и литералы `{ intent: null, path: "" }` уходят в один помощник таблицы;
- **одна грамматика rule ID** — в ядре, рядом с `RuleId` (`rejection.ts`): правило, prose `Z`, «похоже на ID» (RM-02). Codec берёт её оттуда — `src/codec/ids.ts` удалён, в нём остались бы одни реэкспорты; `designRuleIds` в `coverage.ts` становится «ID clauses из `parse` кодека над `docs/design`», её сканер и его тест удаляются.

Не входит:
- раздача строк `checks.ts` по модулям — CONVENTIONS §4 в силе;
- `discussion/tools/lint-ids.mjs` — инструмент `discussion/`, работает без сборки и до S0-01;
- неиспользуемые экспорты — их убирает опись S0-30, если к ней они не нашли вызывающего.

## Шаги

1. Тесты: каждая экспортируемая проверка возвращает `Result` с проверенным значением; `designRuleIds` над `docs/design` даёт тот же набор, что сейчас. Красные.
2. Сигнатуры ядра, затем `ledger`; вызывающие (`apply`, `commit`, `proposal`, `tail`, landing) и `checks.ts` переходят.
3. Грамматика ID в ядре; codec и `coverage.ts` берут её.

## Интерфейс

Сделано так:

```ts
// kernel — каждая экспортируемая жёсткая проверка: Result проверенного значения, Place
checkFormat(format, value, place): Result<string>        checkId(kind, id, place): Result<string>
checkUri(value, place): Result<string>                   checkHeader(value, place): Result<Record>
checkSchema(schema, kind, place): Result<Schema>         checkAgainstType<R>(record: R, resolve, place): Result<R>
decodeUtf8(bytes, place = ROOT)  parseJson(text, place = ROOT)  parseJsonBytes(bytes, place = ROOT)   // Place вместо path
closedForm<T>(value, members: MembersOf<T>, rule, place): Result<T>   // закрытая форма, прочитанная как T
rejectionsOf(result): readonly Rejection[]   ROOT: Place   isRuleId · isZBlockId · isId · isIdLike   // rejection.ts
// ledger
verifyChain(commits, keyOfSession, place): Result<readonly Commit[]>
verifyProposal(p, key, keyOf, place = ROOT): Result<Proposal>
readProposal(value, place = ROOT): Result<Proposal>      decodeCommit(line, place): Result<Commit>
```

- **Без приведения.** Член закрытой формы — guard типа своего поля (`Member<V>`, `fits: (v) => v is V`); таблица `MembersOf<T>` — по члену на поле `T`; `closedForm` отдаёт значение `T` (одно приведение — внутри него, по построению таблицы). У commit и proposal `records` и `intents` в таблице — JSON-значения: каждое читает `checkHeader` и чтение intent, значение собирает вызывающий; `as Commit` и `as Proposal` ушли.
- **Отказы отсортированы** у каждой проверки: результат строят `refuse` и `refused`. `checkHeader` раньше склеивал отказы формы и грамматики полей без сортировки.
- **Где места нет.** `apply`, `land`, `openLines` и `openTail` проверяют вход целиком от корня: место файла store на `main` и его строк задано LG-50 и Q-29 (`/store/knowledge.jsonl`, `/store/knowledge.jsonl/<n>`), место не берут. `validate` не меняется (KR-21).
- **Грамматика ID** — `src/kernel/rejection.ts` рядом с `RuleId`: `isRuleId`, `isZBlockId` (проза и примеры; имя без `prose` — это имя типа `std`, KR-01), `isId`, `isIdLike`. Codec берёт их из ядра, свой разбор абзаца `^ID\. ` заменён на `isIdLike` того, что до первой `". "`. Тип `RuleId` уже грамматики: его префиксы — документов, чьи правила называют отказы; префикс документа сверяет `lint-ids`.
- **Дизайн для теста покрытия** — `designRuleIds(documents)`: ID clauses, которые `parse` кодека читает из каждого документа `docs/design` (`loadDesign` отдаёт байты по имени файла); документ, который codec отклоняет, роняет аудит с его отказами. Набор тот же, что у старого сканера, — 410 ID (сверено при сдаче).
- **`checks.ts`** — строки отдают `Result` проверки как есть, место — `ROOT` ядра или путь от него.
- CONVENTIONS §2, §3 и §4 описывают форму результата, `Place`, `ROOT`, `rejectionsOf`, грамматику ID и `closedForm`.

## Тесты и фикстуры

Новых rule ID нет; все фикстуры зелёные без правки. Тест покрытия (`coverage.test.ts`) видит те же rule ID дизайна, что до задачи.

- `test/kernel/result.test.ts`, `test/ledger/result.test.ts` — каждая экспортируемая проверка отдаёт проверенное значение, берёт `Place` с `intent`, отказы отсортированы (`checkHeader` — красный до задачи).
- `test/kernel/rule-id.test.ts` — грамматика ID в ядре; каждый rule ID реестров `kernel`, `ledger`, `codec` — по ней.
- `coverage.test.ts` — тест сканера заменён тестом `designRuleIds` над каноническим `md` через codec и отказом на неканоническом документе.
- Тесты ядра и `ledger`, которые сравнивали `Rejection[]`, сравнивают `rejectionsOf(…)` — ожидания те же; пути строками стали `Place`. `closed-form.test.ts` идёт через `closedForm` и показывает значение, прочитанное как `T`.

## Готово, когда

- [x] каждая экспортируемая жёсткая проверка `kernel` и `ledger` возвращает `Result<T>` и берёт `Place`
- [x] в `checks.ts` нет `refused(…) ?? { ok: true }`
- [x] грамматика rule ID — одна, в ядре; `coverage.ts` читает ID дизайна через `codec`
- [x] `npm run verify` зелёный

## Риски и заметки

- **Импорт теста.** `coverage.ts` начинает зависеть от `codec`: тест покрытия ломается, если `parse` отклонит `docs/design`. Corpus-тест `codec` уже требует, чтобы весь дизайн разбирался, поэтому это не новое требование.
- **Три модуля** — триггер аудита ST-15. Правка `src/<module>/index.ts` по R9 не триггер.
- **Ссылки других задач.** Сигнатуры `verifyChain` (S0-11), `checkHeader` (S0-13), `verifyProposal` (S0-16) и номера строк `commit.ts` в заметках S0-11 поправлены в той же ветке.
- Задача идёт после S0-36: та убирает часть экспортов `check*`, и параллельная правка одних сигнатур нарушила бы PR-17.
