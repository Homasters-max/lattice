---
id: S0-32
title: Открытие store на tail main
phase: S0
stage: B
size: S
modules: [ledger, assembly]
depends: [S0-03]
rules: [LG-02, LG-14, LG-23, LG-38, ST-01]
---

# S0-32 · Открытие store на tail `main`

## Зачем

Архитектурный разбор S0-03 (2026-10-07, «Открытое» PR #5) нашёл, что у понятия «store на tail `main`» нет модуля:
- **Последовательность собрана в трёх местах.** Tail ref → worktree этого коммита → «что лежит на месте `store/knowledge.jsonl`» → открыть `jsonl` → fold с genesis. В `src/ledger/landing.ts` она дважды (`check` через `tailOf`, `tailView`), в `test/ledger/landing.test.ts` — третий раз (`mainWorktree`, `commitsOnMain`).
- **LG-23 держится на случайности.** Отказ «каталог на месте файла на `main`» выдаёт `keptKnowledge`, хотя она проверяет change request. Срабатывает он только потому, что `tailOf` тернарником не открыл store.
- **Вход `ledger/view` открыт лишнего.** Матрица ST-01 пускает к нему `runtime` и `capabilities`, а он отдаёт им открытие store (`openLines`, `linesOf`) и `row` через `View & Rows`, чего LG-38 им не показывает.

К этому месту дальше придут S0-11 (цепочка и rows адаптеру при открытии, Q-25), S0-12 (вопросы read view) и S0-20 (пересборка на сдвинувшемся `main`). Каждой нужно одно место правки, а не три.

## Объём

Входит:
- **`src/ledger/tail.ts`** — одна операция `openTail(ports)`. Внутрь неё уходят `tailOf`, `heldAt` (теперь `atPath`), `fileOnMain`, `linesOf` и складывание view из строк (`openLines`). Отказ LG-23 «на `main` каталог на месте файла» выдаёт она сама, а не проверка change request: `keptKnowledge` берёт с `main` только файл или `null`.
- **`tailView` удаляется**: `assembly.view` берёт read view из `openTail`.
- **`landing.check`** берёт `before`, tail-коммит и байты `store/knowledge.jsonl` на `main` из `openTail`.
- **Вход `ledger/view`** отдаёт только `View` и `createView`, который возвращает `View`. `Rows`, `linesOf` и `openLines` уходят из него внутрь `ledger`: read view со строками для fold — `viewOf` во внутреннем `src/ledger/rows-view.ts`, там же интерфейс `View`. `openLines` остаётся в `src/ledger/index.ts`: им пользуются фикстуры строк store (KR-10, LG-06, KR-04) и `test/ledger/apply.test.ts`, которому fold нужен view со строками.
- **Хелперы теста.** `commitsOnMain` и чтение `store/knowledge.jsonl` через `mainWorktree` в `landing.test.ts` заменяются `storeOnMain` — вызовом `openTail`; ожидание — по-прежнему весь список строк store на `main` (`storeTextOnMain` против `storeTextOf([commit])`). Список файлов дерева `main` (proposal удалён, код сохранён) store не отвечает и через `openTail` не читается: `mainWorktree` сужается до `filesOnMain` — git, а не store. Порты landing для тестов и proposal одной сущности — общий `test/support/landing.ts`.

Не входит:
- закрытие worktree — S0-34;
- проверки change request и корни `path` — S0-33;
- цепочка, rows адаптеру и обрезанная строка — S0-11.

## Интерфейс

```ts
// src/ledger/tail.ts
interface TailPorts { git: Git; openStore: (worktree: Worktree) => Store }  // LandingPorts extends TailPorts
openTail(ports: TailPorts): Promise<Result<OpenedTail>>
type OpenedTail = { onto: string; view: View & Rows; tail: Commit | null; file: Uint8Array | null }
// file — байты store/knowledge.jsonl на tail main; каталог на его месте — отказ LG-23
fileOnMain(tail: AtPath): Result<Uint8Array | null>   // LG-23, чистая; её зовёт openTail, строка tail в checks.ts
```

`view` — `View & Rows`: landing складывает delta коммита fold по строкам `before` (LG-35). `assembly.view` отдаёт командам `View`. Имя `LandingPorts.openStore` остаётся: это фабрика адаптера `jsonl` на worktree (LG-23). `LandingPorts` наследует `TailPorts`, чтобы `tail.ts` не импортировал `landing.ts`.

## Шаги

1. Тест `openTail` через порты на `git-fixture`: пустой `main`, store из двух коммитов, каталог на месте файла (LG-23), `{}\n` на `main` (LG-06). Тест красный.
2. `tail.ts`; `landing.check` и `assembly` переходят на него; `tailView` удаляется.
3. Сужение входа `ledger/view`; тест структуры (`test/structure/`) показывает, что `runtime` и `capabilities` через `ledger/view` не достают `openLines` и `Rows`.
4. Хелперы `landing.test.ts` заменяются `openTail`.

## Тесты и фикстуры

- Новых rule ID нет. Фикстура `LG-23/trigger/directory-on-main` переходит со строки `knowledge` таблицы `checks.ts` на новую чистую строку `tail` — `fileOnMain`, которую зовёт `openTail`: раннер фикстур синхронный до S0-33. К ней — `LG-23/pass/file-on-main`. Строка `knowledge`, как landing, сперва проводит `main` через `fileOnMain` и возвращает его отказ как есть (CONVENTIONS.md §2), но фикстура каталога на `main` живёт в строке `tail`.
- `test/ledger/tail.test.ts` — `openTail` на `git-fixture`: пустой `main`, store двух landing, каталог на месте файла (LG-23), `{}\n` (LG-06).
- Тест структуры в `test/structure/repo.test.ts`: экспорт `src/ledger/view.ts` — ровно `View` и `createView`, а `createView` возвращает свойства `View`, без `row`.
- Тесты `landing.test.ts` и e2e остаются зелёными без правки ожиданий: список коммитов на `main` (`[commit]`, `[]`) сверяется с текстом `store/knowledge.jsonl`, который прочёл `openTail`.

## Готово, когда

- [x] последовательность «store на tail `main`» живёт в одном модуле; `tailView`, `tailOf` и тестовые копии удалены
- [x] отказ LG-23 «каталог на `main`» выдаёт `openTail`
- [x] вход `ledger/view` — только `View` и `createView`; тест структуры это показывает
- [x] `npm run verify` зелёный

## Риски и заметки

- **Триггер ST-15:** правка `src/ledger/index.ts` и `src/assembly/index.ts` — файлов skeleton. Отметка в разделе PR «Триггеры ST-15».
- **Порядок отказов** (G-19). Отказ открытия store на tail (LG-23, LG-06) теперь идёт до `prepare` change request и проверки proposal: `onto` берётся из `openTail`. Раньше `conflict` и отказ proposal шли раньше него. На `main`, где store не открывается, change request с испорченным proposal получает отказ tail, а не KR-10, а change request, чей код конфликтует с `main`, — отказ tail, а не `conflict` (LG-26). Тест `landing.test.ts` фиксирует второй случай; порядок исходов целиком задаёт и проверяет S0-33.
- S0-33 и S0-34 зависят от этой задачи: обе правят landing, а PR-17 не даёт менять один контракт параллельно.
