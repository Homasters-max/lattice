---
id: S0-06
title: Schema — закрытое подмножество и validate
phase: S0
stage: C
size: M
modules: [kernel]
depends: [S0-33, S0-34]
rules: [KR-18, KR-19, KR-20, KR-21]
---

# S0-06 · Schema — закрытое подмножество и validate

## Зачем

Каждое тело записи проверяется по схеме своего типа (фаза 2). Подмножество закрыто: новое ключевое слово — новая версия ядра (KR-18). После заморозки ядра на SW его уже не расширить без перехода (LT-01).

## Объём

Входит:
- **проверка самой схемы**: только ключевые слова KR-18 и только там, где они применимы; объекты всегда закрыты; `type` — один тип или пара с `null`; `values` — map с ключами `[a-z0-9][a-z0-9._@-]*`; `oneOf` только с `discriminator`, каждая ветка — объект с различным `const` поля-дискриминатора; `$ref` — pinned ссылка; `format` из списка KR-18;
- **аннотации** KR-19 и их допустимые места: `ref: {to, pin, label}` только на `format: ref`; `edge` только на `format: uri`; `unique` только на required поле; `key` только на required поле типа-события (`kind` — параметр); `card_order` — целое (уникальность по цепочке `extends` — S0-07);
- **кардинальность** — только схемой (KR-20): других аннотаций кардинальности нет;
- **`validate(value, schema, resolve)`** (KR-21): `ok` или список `{path, keyword, expected, got}` в детерминированном порядке (S0-02); `$ref` разрешается функцией вызывающего, ядро store не читает; `format` проверяется функциями S0-04 и S0-05.

Не входит: проверка, что `$ref` указывает на abstract тип (нужен тип цели — S0-07 и фаза 2), `compare` (S0-07).

## Интерфейс

```ts
// src/kernel/schema.ts, src/kernel/annotations.ts
type Schema = JsonObject                                                   // схема, которую checkSchema принял
checkSchema(schema: JsonValue, kind: Kind, place: Place): Rejection[]      // KR-18, KR-19; отказы отсортированы

// src/kernel/validate.ts
type Violation = { path, keyword, expected, got }                          // KR-21; path — JSON Pointer (G-13)
type Resolve = (ref: string) => Schema | null                              // $ref как записан: type@n
validate(value, schema: Schema, resolve): { ok: true } | { ok: false, violations }   // KR-21, CONVENTIONS §2
checkBody(body, schema: Schema, resolve, place: Place): Rejection[]        // KR-21: отказ на каждое нарушение

// src/kernel/ref.ts
isPinned(s: string): boolean               // pinned ссылка без фрагмента: type записи, $ref, ref.to
```

Как сделано:
- **Интерфейс по соглашениям, а не по наброску.** `checkSchema` — жёсткая проверка с фикстурами ST-17, поэтому отказы `Rejection` с KR-18 и KR-19 и путём от `place.path` (CONVENTIONS §2), а не `Violation[]`; `kind` — аргумент, как у `checkId` и `checkRev`. `validate` возвращает `{ ok } | { ok: false, violations }`, как велит CONVENTIONS §2.
- **`checkBody`** добавлен к `validate`: фикстуре KR-21 нужна жёсткая проверка, а отказ строит только проверка ядра. Каждое нарушение — отказ KR-21 с путём `place.path` + путь нарушения и `expected` `{keyword: …}`; фаза 2 apply зовёт её (заметка в S0-13). Все нарушения — KR-21, и формат внутри схемы тоже, а не KR-11: отказы правил формата — для проверок вне схемы (заметка S0-04).
- **Форма схемы и места аннотаций** — по рекомендациям G-22 и G-23 (PLAN.md, раздел 12). Схема без `type`, `$ref`, `oneOf`, `enum` и `const` отклоняется: она пускала бы любой объект, а объекты всегда закрыты.
- **`validate` над схемой, которую принял `checkSchema`**: другая схема — ошибка программы `bug:`, а не нарушение значения. Аннотации `validate` не проверяет: `pin` и метка — фаза 4 (S0-15). `$ref`, которого `resolve` не знает, и `$ref`, вернувшийся к себе до спуска в значение, — нарушения `$ref`, а не исключение и не зацикливание. Обе проверки идут своим стеком, так что глубина вложенности стек не переполняет.
- **`isPinned`** вынесен в `ref.ts` из `checkType` заголовка (KR-07): та же грамматика нужна `$ref` и `ref.to`. В `json.ts` — `isJsonArray` (`Array.isArray` сужает до `any[]`) и `own`: член объекта читается только свой, поле может называться `constructor`.

## Тесты и фикстуры

- На каждое ключевое слово: значение проходит и не проходит; на каждое запрещённое (`pattern`, `additionalProperties`, `allOf`, `anyOf`, `if`, …) — отказ KR-18.
- Порядок нарушений стабилен при перестановке ключей входа.
- Фикстуры trigger/pass: KR-18 (ключевое слово вне подмножества, открытый объект), KR-19 (аннотация не на своём месте), KR-21 (тело не проходит схему типа).

Как сделано: `test/kernel/schema.test.ts` — каждое ключевое слово на месте, вне места и с плохим значением, запрещённые, закрытость, `$ref` и `oneOf`, кардинальность KR-20, порядок; `test/kernel/schema-annotations.test.ts` — место и форма каждой аннотации; `test/kernel/validate.test.ts` — каждое ключевое слово проходит и не проходит, объекты, map, массивы, `oneOf`, `$ref`; `test/kernel/validate-order.test.ts` — порядок, свойство fast-check «перестановка ключей значения и схемы не меняет результат», `resolve` — единственный вход, `checkBody`. Строки `checks.ts`: `schema` (`{schema, kind}` — `checkSchema` от корня), `body` (`{body, schema, types?}` — `checkBody` от корня, `$ref` из `types`). Фикстуры — `test/fixtures/{KR-18,KR-19,KR-21}/`. KR-20 своей жёсткой проверки не имеет: её держит закрытость KR-18, показывают тесты.

## Готово, когда

- [x] схема вне подмножества отклоняется с KR-18 и путём к ключевому слову
- [x] `validate` детерминирован и не читает ничего, кроме `resolve`
- [x] фикстуры KR-18, KR-19, KR-21 — trigger и pass

## Риски и заметки

- `pattern` сознательно исключён (D30); если тип `std` без него не выражается — это находка для S0-09, а не повод добавить ключевое слово.
- От S0-04: `format` KR-11 проверяет булев `isFormat(format, s)` из ядра — нарушение `validate` остаётся своим типом (KR-21), а `checkFormat` с отказом KR-11 — для проверок вне схемы.
- От S0-05: `format: ref` — `parseRef(s)` (`ok` — ссылка, иначе отказ KR-23), `format: uri` — булев `isUri(s)` (KR-24, G-06); для нарушения `validate` берётся булев ответ, `checkUri` с отказом KR-24 — для проверок вне схемы, как `checkFormat`.
