---
id: S0-07
title: Type и compare
phase: S0
stage: C
size: L
modules: [kernel]
depends: [S0-06]
rules: [KR-14, KR-15, KR-16, KR-17, KR-19, KR-22]
---

# S0-07 · Type и compare

## Зачем

Одна функция `compare` обслуживает `extends` (KR-15), ревизии типов (RF-13) и ревизии контрактов (RF-15). От её корректности зависит, что apply пропустит как совместимое изменение. Это самая сложная чистая функция S0.

## Объём

Входит:
- **мета-тип** `core/type`: создаётся кодом ядра, типизирован самим собой — единственная самоссылка; тело `{extends, abstract, kind, schema}` (KR-14); его hash — константа версии ядра;
- **проверка тела типа**: `extends` — необязательная pinned ссылка; `abstract` — boolean; `kind` — `entity` или `event`; `schema` проходит `checkSchema` (S0-06);
- **цепочка `extends`** (KR-15): один родитель, без циклов (в том числе внутри одного коммита — через `resolve` над `after`), глубина не больше 4, `kind` не меняется, ребёнок `narrower` или `same` относительно родителя в режиме `extends`, позиции `card_order` уникальны по цепочке (KR-19);
- **abstract** (KR-16): у abstract типа нет записей — функция для фазы 2; `$ref` указывает только на abstract тип;
- **без множественного наследования** (KR-17) — по построению: одно поле `extends`;
- **`compare(A, B, mode)`** → `{relation, aspects}` (KR-22): `same`, `narrower`, `wider`, `incomparable`; режим `revision` — объекты закрыты (добавленное необязательное поле — `wider`, добавленное обязательное — `incomparable`); режим `extends` — A сравнивается с B только по полям B; `aspects` — `validity`, `graph` (`ref`, `edge`, `unique`, `key`), `presentation` (`card_order`, `description`); изменённые `label`, `edge`, `key` дают `incomparable`; `pinned` и `floating` уже, чем `any`; более узкий `ref.to` (подтип по `extends`) уже; добавленный `unique` уже.

Не входит: классы эволюции контрактов (RF-15 — S0-18), использование в apply (S0-13).

## Интерфейс

```ts
// src/kernel/type.ts, check-type.ts, meta-type.ts, compare*.ts
type ResolveType = (ref: string) => JsonValue | null  // тело типа по pinned ссылке, из after
META_TYPE: MetaType                                   // core/type@1 без by и at (G-26), KR-14
checkType(body, resolve: ResolveType, place): Rejection[]   // KR-14…KR-17, KR-18/19 схемы, KR-19 card_order по цепочке
checkRecordType(type, place): Rejection[]             // KR-16: у abstract типа нет записей — для фазы 2
compare(a: Schema, b: Schema, mode: Mode, resolve: ResolveType): { relation: Relation, aspects: Aspect[] }
```

## Шаги

1. Мета-тип и проверка тела типа.
2. `compare` по ключевым словам снизу вверх: скаляры и `enum`/`const` → диапазоны (`minimum`…`maxItems`) → `format` → массивы → объекты в двух режимах → `oneOf` по дискриминатору → `$ref` через `resolve` → аннотации.
3. Цепочка `extends` поверх `compare`.

## Тесты и фикстуры

- Таблица пар схем с ожидаемым `{relation, aspects}` — по строке на каждое утверждение KR-22.
- Property-тест корректности (fast-check): если `compare(A, B)` — `narrower` или `same`, то каждое сгенерированное значение, валидное под A, валидно под B. `incomparable` допустим всегда — это безопасная сторона (R2).
- Фикстуры trigger/pass: KR-14 (плохое тело типа), KR-15 (цикл, глубина 5, расширение вместо сужения, смена `kind`), KR-16 (запись abstract типа; `$ref` на не-abstract), KR-19 (повтор `card_order` в цепочке).

## Готово, когда

- [x] hash мета-типа — константа, закреплённая в тесте
- [x] таблица KR-22 и property-тест корректности зелёные
- [x] фикстуры KR-14, KR-15, KR-16 — trigger и pass

## Риски и заметки

- Правило «`incomparable`, когда узость нельзя показать структурно» — главный предохранитель; любой спорный случай решается в его пользу и записывается в PLAN.md, раздел 12, как пробел.
- Если задача растёт сверх L — делить на «тип и `extends`» и «`compare`», а не по слоям.
- От S0-06: `checkSchema(schema, kind, place)` ядра возвращает `Rejection[]` с KR-18 и KR-19 и путём от `place.path` (`/body/schema/...`), а не `Violation[]`: это жёсткая проверка (CONVENTIONS §2). Место и форму `card_order` (целое, на поле) она уже проверяет; уникальность позиций по цепочке `extends` — здесь. `$ref` она проверяет только как pinned ссылку `type@n` (`isPinned`): что цель — abstract тип, видит только проверка с типом цели. Форма схемы — G-22, места аннотаций — G-23; `compare` читает схему в этой форме: пара `type` — в любом порядке, поле — член `properties` на любой глубине.

## Отступления

- **Интерфейс.** `checkType` — жёсткая проверка (CONVENTIONS §2): возвращает `Rejection[]` от `place`, а не `Violation[]`; `resolve` даёт тело типа (`ResolveType`), а не схему: проверке нужны `kind`, `abstract` и `extends` родителя и цели `$ref`. `META_TYPE` — запись без `by` и `at` (`MetaType`): их пишет genesis (LG-47), ядро сессий не знает (KR-01), hash от них не зависит (G-26). Для фазы 2 добавлен `checkRecordType` (KR-16). Тип результата `compare` не экспортируется: `Relation`, `Aspect`, `Mode` — имена из KR-22.
- **Файлы.** `type.ts` — тело типа и цепочка `extends`; `check-type.ts` — проверка тела; `meta-type.ts`; `compare.ts` — обход пары, `compare-values.ts` — значения одной схемы, `compare-annotations.ts` — граф и представление, `compare-shown.ts` — что показано о паре. `schema.ts` отдаёт обход схемы `sitesOf`.
- **KR-17** показан тестом `test/kernel/type.test.ts`: несколько родителей — отказ формы `extends` с KR-14; своей проверки и фикстур у KR-17 нет — по построению.
- **KR-19** по цепочке — фикстура `test/fixtures/KR-19/trigger/card-order-repeated-in-chain.json`.
- **Файлы skeleton.** `test/structure/purity.test.ts` и `test/structure/repo.test.ts` (`skeleton-files.txt`) поправлены: программа TypeScript и её checker строятся в `beforeAll` с таймаутом 30 с, а не в первом тесте, — под нагрузкой полного прогона сборка дольше 5 с теста. Проверки и ожидания не изменены. Это триггер аудита ST-15.
- **Пробелы** G-26 (тело и мета-тип, глубина, `card_order` по цепочке) и G-27 (форма `aspects`, `$ref`, `oneOf`, предел обхода) — работа по рекомендации, решает владелец.
