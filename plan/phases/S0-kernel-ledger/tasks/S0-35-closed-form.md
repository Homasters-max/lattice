---
id: S0-35
title: Закрытая форма объекта — одна функция ядра
phase: S0
stage: C
size: S
modules: [kernel, ledger]
depends: [S0-05, S0-06, S0-07, S0-10]
rules: [KR-04, KR-14, KR-19, LG-06, LG-09, LG-10, LG-17, ST-17]
---

# S0-35 · Закрытая форма объекта — одна функция ядра

## Зачем

Архитектурный разбор, волна 2 (2026-10-07, после S0-04…S0-07, S0-10, S0-25). Одно понятие — поля объекта против таблицы его членов: каждое поле своего вида, лишнего поля нет, отказ — по JSON Pointer (G-13) — написано пять раз:

| Где | Правило | Своя копия |
|---|---|---|
| `src/kernel/record.ts` (`HEADER`, `form`) | KR-04 | путь `` `${path}/${name}` `` без `pointer()` |
| `src/kernel/check-type.ts` (members) | KR-14 | через `pointer()` |
| `src/kernel/annotations.ts` | KR-19 | через `pointer()` |
| `src/ledger/commit.ts` (`COMMIT`, `commitRejections`) | LG-06 | **лишнее поле не отклоняется** |
| `src/ledger/proposal.ts` (`closed`) | LG-09 | путь `` `${root}/${name}` `` без `pointer()` |

Копии уже разошлись, и в двух местах это дефект:
- **Заголовок commit открыт (Q-31).** `commitRejections` не отклоняет поле вне LG-06, а `commitHash` берёт поля перечислением. Строка store с приземлённым коммитом и `"zzz":1` открывается (`openLines` — `ok: true`), и hash с этим полем и без него один: в store лежат байты, которые не покрывают ни hash, ни подпись.
- **Пути не экранируются (Q-32).** `checkHeader({"a/b~c": 1}, "")` даёт `path` `/a/b~c` вместо `/a~1b~0c` (RFC 6901); так же — лишнее поле proposal и intent.

S0-08 (типы как данные), S0-13 (фаза 1), S0-16 (policy, сессии, сертификаты) и S0-23 (genesis) добавят ещё закрытые формы: каждая должна стать таблицей, а не новой копией.

## Объём

Входит:
- **одна функция ядра** в новом файле `src/kernel/` (строка в `test/structure/kernel-files.txt`, ST-05; по R9 это не файл skeleton). Вход — таблица членов (имя → какой вид ждётся, обязательно ли поле), rule ID и `Place`. Выход — отказы: лишнее поле — `expected: "absent"`; поле не своего вида — `expected` из таблицы; `path` каждого — через `pointer()`; порядок — CONVENTIONS §5. Вложенное (records коммита, intents proposal) вызывающий проверяет сам повторным вызовом: рекурсии по схеме нет, это не второй `validate` (KR-18);
- **пять мест переходят на неё**: каждый модуль держит только свою таблицу членов; `Field`/`STRING`/`NUMBER` и логика «лишнее или пропущенное поле» в `record.ts`, `check-type.ts`, `annotations.ts`, `commit.ts`, `proposal.ts` удаляются;
- **заголовок commit закрыт** (Q-31, LG-06): поле вне таблицы — отказ LG-06 на его пути;
- **hash из таблицы**: `commitHash` — hash всех членов формы commit, кроме `sig` (LG-06); `proposalHash` — всех членов формы proposal, кроме `sig` (LG-10). Ручных перечислений полей нет: новое поле заголовка (KR-04 — новая версия ядра) добавляется в одном месте.

Не входит:
- форма результата проверки (`Result` вместо `Rejection[]`) — S0-37;
- новые закрытые формы (namespace policy, сессия, сертификат) — их задачи берут функцию готовой.

## Интерфейс

Набросок; точную форму выбирает задача.

```ts
// src/kernel/<file>.ts
type Member = { readonly expected: string; readonly fits: (v: JsonValue | undefined) => boolean };
type Members = { readonly [name: string]: Member };
closedRejections(value: JsonObject, members: Members, rule: Rule, place: Place): Rejection[]
```

## Шаги

1. Тесты функции через `index.ts`: лишнее поле, поле не своего вида, необязательное поле, имя с `/` и `~`, порядок отказов, `deepFreeze` входа. Фикстуры Q-31 и Q-32. Красные.
2. Функция в ядре; `record.ts`, `check-type.ts`, `annotations.ts` переходят на неё.
3. `commit.ts` и `proposal.ts` переходят на неё; `commitHash` и `proposalHash` берут поля из таблицы.
4. Существующие фикстуры KR-04, KR-14, KR-19, LG-06, LG-09 и тесты модулей зелёные без правки ожиданий; правка ожидания — только там, где путь был неэкранирован.

## Тесты и фикстуры

- `LG-06/trigger/commit-extra-field` — строка store с лишним полем заголовка; отказ LG-06, `path` — это поле (Q-31).
- `KR-04/trigger/header-extra-field-escaped` — лишнее поле `"a/b~c"`; `path` `/a~1b~0c` (Q-32).
- `LG-09/trigger/proposal-extra-field-escaped` — то же для proposal.
- Тест: `commitHash` меняется при изменении любого члена формы commit, кроме `sig`, и не меняется при изменении `sig`; так же `proposalHash` для формы proposal.

## Готово, когда

- [x] одна функция закрытой формы в ядре; пять копий удалены
- [x] лишнее поле заголовка commit — отказ LG-06 с фикстурой
- [x] `path` каждого отказа закрытой формы — JSON Pointer с экранированием, с фикстурой
- [x] `commitHash` и `proposalHash` берут поля из таблицы формы
- [x] `npm run verify` зелёный

## Риски и заметки

- **Q-31, Q-32** — решения владельца 2026-10-07 (PLAN.md, раздел 11). Правка `docs/design` не нужна: LG-06 перечисляет заголовок, G-13 и CONVENTIONS §3 задают JSON Pointer.
- **Замыкание.** Функция — обычный код внутри механизмов KR-04, LG-06, LG-09 (PR-06), а не реестр форм и не фреймворк: без регистрации, без конфигурации, без обхода по схеме. В глоссарий не добавляется.
- S0-36 и S0-37 зависят от этой задачи: обе правят те же файлы ядра.

## Отступления

- **Файл и интерфейс.** Функция — `closedRejections(value, members, rule, place)` в `src/kernel/closed-form.ts`, типы `Member` и `Members` — как в наброске; `expected` члена — JSON-значение, как у членов `ref` и тела типа (`["entity", "event"]`). Обязательность поля — в `fits` члена: необязательный член принимает `undefined`. Общие члены JSON-видов — `STRING`, `NUMBER`, `STRING_OR_NULL`, `JSON_VALUE` — экспортирует тот же файл: таблицы `record.ts`, `commit.ts`, `proposal.ts` берут их, а не пишут свои копии.
- **Hash из таблицы.** `unsigned(value, members)` в `src/ledger/commit.ts` — члены формы без `sig`; `commitHash` и `proposalHash` берут его, `proposalHash` ставит поверх intents в каноническом порядке (LG-10).
- **Аннотации.** Проверка значения аннотации (`annotations.ts`) возвращает отказы от места аннотации; промежуточный тип `Fault` удалён, `ref` проверяется закрытой формой.
- **Ожидание порядка.** Закрытая форма отдаёт отказы в порядке CONVENTIONS §5 (объём задачи), поэтому `checkHeader` теперь даёт `/0/hash` раньше `/0/rev`: ожидание порядка в `test/kernel/kernel.test.ts` поправлено под §5 — состав отказов, их пути и значения те же. Других правок ожиданий нет.
- **Фикстуры.** Сверх списка задачи — `LG-09/trigger/intent-extra-field-escaped` (Q-32 для intent: путь внутри intent экранирован). Тест «hash покрывает каждый член формы, кроме `sig`» — `test/ledger/chain.test.ts` (commit) и `test/ledger/proposal.test.ts` (proposal); он зелёный и до перехода — ручные перечисления были полны, тест держит это для новых членов.
