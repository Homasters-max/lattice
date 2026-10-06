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
META_TYPE: Record                                     // core/type, KR-14
checkType(body, resolve): Violation[]                 // KR-14…KR-17, KR-19 card_order
compare(a: Schema, b: Schema, mode: "revision" | "extends", resolve): { relation, aspects }
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

- [ ] hash мета-типа — константа, закреплённая в тесте
- [ ] таблица KR-22 и property-тест корректности зелёные
- [ ] фикстуры KR-14, KR-15, KR-16 — trigger и pass

## Риски и заметки

- Правило «`incomparable`, когда узость нельзя показать структурно» — главный предохранитель; любой спорный случай решается в его пользу и записывается в PLAN.md, раздел 12, как пробел.
- Если задача растёт сверх L — делить на «тип и `extends`» и «`compare`», а не по слоям.
