---
id: S0-04
title: Canon, hash и канонические форматы
phase: S0
stage: C
size: M
modules: [kernel, ledger]
depends: [S0-33, S0-34]
rules: [KR-10, KR-11, KR-12, KR-13]
---

# S0-04 · Canon, hash и канонические форматы

## Зачем

Hash каждой записи, proposal и коммита считается от канонических байтов. Ошибка здесь меняет все hash и, после заморозки ядра, требует новой версии ядра (KR-03). Поэтому — свой код и замороженные векторы (KR-02).

## Объём

Входит:
- **строгий разбор JSON** (D-04): отказ на дубликате ключа, на `-0`, на целом вне ±2^53, на строке не в NFC, на одиночном суррогате (I-JSON); ничего не чинится (KR-10);
- **`canon(value)`** по RFC 8785: сортировка ключей по UTF-16 code units, числа по правилу ECMAScript, экранирование строк JCS; на входе — только значения, прошедшие проверки KR-10; `NaN`, `Infinity`, `-0` отклоняются;
- **форматы KR-11**: `date-time` (UTC, `Z`, ровно 6 знаков дроби, корректная календарная дата), `date`, `decimal` (регулярное выражение KR-11, не `-0`), `ulid` (26 символов Crockford, верхний регистр; переполнение — G-07);
- **`hash(type, body)`** = `"sha256:" + hex(sha256(canon({type, body})))` (KR-12); sha256 — `node:crypto` (D-06);
- **лимит тела** 256 KiB по каноническим UTF-8 байтам `body` (G-05) — константа версии ядра (KR-13).

Не входит: схема и проверка `format: ref`/`uri` (S0-05, S0-06).

## Интерфейс

Как сделано (`Result` и `Rejection` — `CONVENTIONS.md` §2–3; `place` — `{intent, path}`, по умолчанию корень входа, G-13):

```ts
parseJson(text: string, path?: string): Result<JsonValue>              // KR-10, строгий парсер вместо мягкого (G-16)
parseJsonBytes(bytes: Uint8Array, path?: string): Result<JsonValue>    // KR-10: UTF-8, затем parseJson
canon(value: JsonValue, place?: Place): Result<string>                  // KR-10, RFC 8785
hash(value: JsonValue, place?: Place): Result<string>                   // KR-12
hashRecord(type: string, body: JsonValue, place?: Place): Result<string> // KR-12, KR-13
BODY_LIMIT = 262_144                                                     // KR-13, G-05
isFormat(format: Format, s: string): boolean                             // KR-11
checkFormat(format: Format, value: JsonValue, place: Place): Rejection[] // KR-11
```

## Шаги

1. Векторы в `test/vectors/`: RFC 8785 Appendix B (числа и примеры), случаи NFC (совпадающие и не совпадающие с NFC), допустимые и недопустимые написания каждого формата KR-11. Hash файлов векторов закрепить в тесте: изменение вектора валит тест (KR-13).
2. Строгий парсер, затем `canon`, затем форматы и `hashRecord`.
3. Property-тесты: `canon(parse(canon(x))) == canon(x)`; перестановка ключей не меняет `canon`.

## Тесты и фикстуры

Жёсткие проверки фазы 1 apply используют эти функции, поэтому фикстуры trigger/pass нужны для: KR-10 (дубликат ключа, `-0`, большое целое, не-NFC), KR-11 (каждый формат), KR-13 (тело больше лимита).

## Готово, когда

- [ ] все векторы RFC 8785 Appendix B проходят; файлы векторов закреплены по hash
- [ ] отказы KR-10 и KR-11 называют rule ID и путь
- [ ] фикстуры KR-10, KR-11, KR-13 — trigger и pass
- [ ] код в периметре ядра (ST-05), без импортов других модулей

## Риски и заметки

- `JSON.parse` нельзя использовать даже как первый шаг: дубликаты теряются молча.
- `String.prototype.normalize` зависит от версии Unicode в ICU; версия ICU записывается рядом с векторами NFC, расхождение между ОС ловит CI на windows (D-09).
- От S0-03 (G-16, Q-10): JSON уже разбирает одна функция — `parseJson(text, path)` в `src/kernel/parse.ts`, с `decodeUtf8(bytes, path)`; обе отказывают с KR-10, фикстуры `test/fixtures/KR-10/` есть. Задача заменяет мягкий `JSON.parse` строгим парсером, дописывает trigger на дубликат ключа, ±2^53, NFC, `-0` и снимает тест «G-16» в `test/kernel/kernel.test.ts`.

## Как сделано

- **Файлы ядра.** `src/kernel/json.ts` — значения и `serialize`, писатель RFC 8785 без проверок: под `canon` и для сообщений отказов, чей `got` может быть ровно тем, что KR-10 отклоняет (одиночный суррогат, не-NFC). `canon.ts` — `canon` и проверки KR-10, общие с парсером. `parse.ts` — строгий парсер, свой код по RFC 8259. `hash.ts` — `hash`, `hashRecord`, `BODY_LIMIT`. `formats.ts` — `isFormat`, `checkFormat`; `isUlid` переехал сюда из `record.ts`. Реестр: `KR_11`, `KR_13`. Парсер и `canon` идут своим стеком: никакая вложенность не переполняет стек вызовов.
- **Интерфейс по соглашениям, а не по наброску.** Отказы — `Result<T>` с `Rejection` по `CONVENTIONS.md` §2–3, а не `Violation[]`: `Violation` — тип `validate` (KR-21). `parseStrict` — это строгий `parseJson` (имя из S0-03 осталось, как велит заметка выше). `checkFormat` отказывает с KR-11 и путём, как `checkId`; булев ответ — `isFormat`: им пользуется `validate` (S0-06). `canon`, `hash`, `hashRecord` берут необязательное `place`, чтобы отказ внутри intent был путём intent (G-13), а не переписывался.
- **Что отклоняет KR-10.** Строгий парсер: текст не JSON (целиком, по пути входа); внутри значения по JSON Pointer — дубликат ключа, `-0`, не конечное число (`1e400`), целое вне ±(2^53−1) (G-20), строка или ключ с одиночным суррогатом, с noncharacter (I-JSON, RFC 7493 §2.1: «Input must be I-JSON») или не в NFC. `got` числа — как оно написано. `canon` отклоняет то же на значении, собранном в коде.
- **Векторы.** `test/vectors/rfc8785-numbers.json` (приложение B целиком), `rfc8785-examples.json` (примеры §3.2.2 и §3.2.3), `nfc.json` (с версиями ICU и Unicode, на которых записан), `formats.json`. Закреплены по hash в `test/kernel/vectors.test.ts`. Приложение B «проходит» так: вывод каждого конечного числа равен RFC 8785; `canon` допускает его в том же написании или отклоняет по KR-10 — `-0`, `NaN`, `Infinity` и целые от 2^53 (`1e+21`, `1e+23`, `2^68`, максимум double). Оба примера RFC тоже отклоняются строгим разбором: `1E30` — целое вне диапазона, ключ `U+FB33` — не NFC; их канонический вывод сверен через `serialize`.
- **Фаза 1 apply** (ledger): отказы `hashRecord` пришлось принять в apply — иначе тело больше 256 KiB, которое строгий разбор пропускает, падало бы исключением. Фаза 1 проверяет canon proposal (session и sig от корня, каждый intent внутри себя, G-13) и лимит каждого тела (KR-13). После неё всё, из чего сложен коммит, канонично; `known` в `src/ledger/commit.ts` раскрывает `Result` у `encodeCommit`, `commitHash`, `proposalHash` и hash записи, отказ там — `bug:`. Поэтому `modules: [kernel, ledger]`. Остальное фазы 1 (заголовок, форматы `at` и `by`) — S0-05 и S0-13.
- **Фикстуры.** KR-10 — строка `json` (дубликат ключа, `-0`, целое вне диапазона, не конечное число, строка и ключ не в NFC, одиночный суррогат, noncharacter) и строка `apply` (тело не в NFC, путь внутри intent). KR-11 — новая строка `format` в `test/fixtures/checks.ts`, trigger и pass на каждый формат. KR-13 — строка `apply`: тело в 262 145 канонических байт.
- **Тесты.** `test/kernel/{parse,canon,formats,vectors}.test.ts`; свойства fast-check — в `canon.test.ts`; фаза 1 apply — `test/ledger/apply.test.ts`. Тест «G-16» и «thin canon» сняты из `kernel.test.ts`.
- **Пробелы.** G-20 — граница целых и точность дробей; G-21 — секунда координации и диапазон года в `date-time`.
