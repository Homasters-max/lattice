---
id: S0-05
title: Record и Ref
phase: S0
stage: C
size: S
modules: [kernel]
depends: [S0-33, S0-34]
rules: [KR-04, KR-05, KR-06, KR-07, KR-08, KR-09, KR-23, KR-24, KR-25, PR-01]
---

# S0-05 · Record и Ref

## Зачем

Один конверт, одна модель идентичности и одна форма ссылки для всех записей (PR-01). Фаза 1 apply проверяет заголовок; кодек, фаза 4 и fold разбирают ссылки одной функцией.

## Объём

Входит:
- **заголовок** `{id, rev, type, hash, by, at, body}` — ровно эти поля, `rev` только у entity (KR-04, KR-05); вид записи берётся из `kind` её типа, поэтому проверка «`rev` есть ⇔ entity» получает `kind` параметром — в фазе 2 (S0-13);
- **грамматика `id`** (KR-06): entity `namespace/slug`, namespace `[a-z][a-z0-9-]*`, slug `[a-z0-9][a-z0-9.-]*`; event — ULID;
- `type` — всегда pinned ссылка `type@n` (KR-07); `by` — ULID события сессии (KR-08); `at` — `date-time` KR-11 (KR-08, KR-09); ядро не придаёт времени смысла;
- **ссылки** (KR-23): разбор и формат `id`, `id@n` (`n` — G-12), ULID события, фрагмент `#seg/seg/…`, сегмент — имя поля `[a-z][a-z0-9_]*`, ключ map (KR-18) или индекс массива; неоднозначность «ключ или индекс» снимает тип цели при разрешении (ledger);
- **`format: uri`** — только проверка, что это URI со схемой (KR-24, G-06);
- разрешение ссылок — не здесь (KR-25).

## Интерфейс

```ts
// src/kernel/id.ts — грамматика id перенесена сюда из record.ts: ref.ts и record.ts оба её читают
type Kind = "entity" | "event"
isEntityId(id: string): boolean; checkId(kind, id, place): Rejection[]      // KR-06

// src/kernel/ref.ts
type Ref = { kind: "entity", id, rev?, fragment?: readonly string[] } | { kind: "event", id, fragment?: readonly string[] }
parseRef(s: string, place = { intent: null, path: "" }): Result<Ref>       // KR-23; отказ KR-23 у place
formatRef(r: Ref): string                                                   // formatRef(parseRef(s)) === s

// src/kernel/record.ts
checkHeader(value, path): Rejection[]       // KR-04, KR-06, KR-07, KR-08; at — KR-11 (checkFormat)
checkRev(kind, rev, place): Rejection[]     // KR-04, KR-05: rev есть ⇔ kind типа — entity; зовёт фаза 2 (S0-13)

// src/kernel/uri.ts
isUri(s: string): boolean                   // KR-24: RFC 3986 URI, схема обязательна, фрагмент допустим (G-06)
checkUri(value, place): Rejection[]         // KR-24: отказ у place, не строка тоже
```

Как сделано:
- **Отказ, не нарушение.** `parseRef` — жёсткая проверка с фикстурами ST-17, поэтому возвращает `Result` с отказом KR-23 (CONVENTIONS §2), а не нарушения `validate`; место отказа — `place`, как у `checkFormat`. Любая строка вне грамматики, и `id` с ошибкой тоже, — KR-23: проверка применяет грамматику ссылки целиком.
- **Фрагмент — список сегментов.** Сегмент читается грамматикой ключа map KR-18 `[a-z0-9][a-z0-9._@-]*`: она вмещает имя поля и индекс массива, а что из трёх — решает тип цели при разрешении (KR-25).
- **`n` в `id@n`** — по рекомендации G-12: целое от 1 без ведущих нулей, и safe integer, как всякое целое JSON (G-20).
- **`rev` против `kind`** — отдельная функция `checkRev`, а не необязательный параметр `checkHeader`: параметр, который включает и выключает проверку, — класс «отключение проверки» `plan/closure-check.md`. `checkHeader` без типа читает вид, который заявляет заголовок: с `rev` — entity, без — event, и по нему грамматику `id`; так открытие store проверяет `id` до fold типов.
- **`at`** отклоняется KR-11 (`checkFormat`), как задано заметкой S0-04; `by` — KR-08, ULID. `hash` проверяется как строка (KR-04): равен ли он hash записи (KR-12) — не вопрос формы.
- **`checkUri`** добавлен к `isUri`: KR-24 — жёсткая проверка с фикстурами, а отказ строит только проверка ядра.

## Тесты и фикстуры

- Таблица допустимых и недопустимых `id`, ссылок и фрагментов; свойство `formatRef(parseRef(s)) === s` на допустимых.
- Фикстуры trigger/pass: KR-04 (лишнее поле, нет поля), KR-06, KR-07 (floating `type`), KR-08, KR-23 (плохой фрагмент), KR-24.

Как сделано: `test/kernel/ref.test.ts` — таблицы ссылок и URI, свойство fast-check; `test/kernel/record.test.ts` — заголовок и `checkRev`. Строки `checks.ts`: `header` (`{record, kind?}` — `checkHeader` от корня, с `kind` ещё `checkRev`), `ref` (`{ref}`), `uri` (`{value}`). Фикстуры — `test/fixtures/{KR-04,KR-06,KR-07,KR-08,KR-11,KR-23,KR-24}/` (`header-*`, `type-*`, `by-*`, `fragment-*`, `uri-*`…).

## Готово, когда

- [x] разбор и формат ссылок взаимно обратны на всех допустимых примерах
- [x] заголовок проверяется с отказами, называющими KR-04…KR-08
- [x] фикстуры перечисленных правил — trigger и pass

## Риски и заметки

- Ключ map допускает `@` и `.` — сегмент фрагмента разбирается только после `#`, конфликта с `id@n` нет; тест на это обязателен.
- От S0-03 (ревью, волна 2): `checkHeader(value, path)` в `src/kernel/record.ts` уже проверяет заголовок поверхностно — поля и их виды JSON, `rev` число или нет его, отказ KR-04 с фикстурами `test/fixtures/KR-04/`; его зовёт открытие store для каждой записи коммита. Задача доводит его до KR-04…KR-08: ровно эти поля, форматы, `rev` против `kind` типа.
- От S0-04: формат `at` проверяет `checkFormat("date-time", value, place)` из `src/kernel/formats.ts` — отказ KR-11 с путём; `isUlid` живёт там же (`isFormat("ulid", …)`, G-07). Канонические байты и лимит тела фаза 1 apply уже проверяет (`canon`, `hashRecord`).
- Сделано: открытие store теперь отклоняет и запись, чей `type` floating, `by` не ULID или `at` не канонический; фаза 1 apply эти поля intent пока не проверяет — её заголовок подключает S0-13 (заметка там).
