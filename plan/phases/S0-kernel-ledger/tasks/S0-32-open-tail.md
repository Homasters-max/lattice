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
- **`src/ledger/tail.ts`** — одна операция `openTail(ports)`. Внутрь неё уходят `tailOf`, `heldAt`, `fileOnMain`, `linesOf` и складывание view из строк. Отказ LG-23 «на `main` каталог на месте файла» выдаёт она сама, а не проверка change request.
- **`tailView` удаляется**: `assembly.view` берёт read view из `openTail`.
- **`landing.check`** берёт `before`, tail-коммит и байты `store/knowledge.jsonl` на `main` из `openTail`.
- **Вход `ledger/view`** отдаёт только `View` и `createView`, который возвращает `View`. `Rows`, `linesOf` и `openLines` уходят из него внутрь `ledger`. `openLines` остаётся в `src/ledger/index.ts`: им пользуются фикстуры строк store (KR-10, LG-06, KR-04).
- **Хелперы теста.** `mainWorktree` и `commitsOnMain` в `landing.test.ts` заменяются вызовом `openTail`.

Не входит:
- закрытие worktree — S0-34;
- проверки change request и корни `path` — S0-33;
- цепочка, rows адаптеру и обрезанная строка — S0-11.

## Интерфейс

```ts
// src/ledger/tail.ts — набросок; точные типы — здесь
openTail(ports: LandingPorts): Promise<Result<OpenedTail>>
type OpenedTail = { onto: string; view: View; tail: Commit | null; knowledge: Uint8Array | null }
// knowledge — байты store/knowledge.jsonl на tail main; каталог на его месте — отказ LG-23
```

Имя `LandingPorts.openStore` остаётся: это фабрика адаптера `jsonl` на worktree (LG-23).

## Шаги

1. Тест `openTail` через порты на `git-fixture`: пустой `main`, store из двух коммитов, каталог на месте файла (LG-23), `{}\n` на `main` (LG-06). Тест красный.
2. `tail.ts`; `landing.check` и `assembly` переходят на него; `tailView` удаляется.
3. Сужение входа `ledger/view`; тест структуры (`test/structure/`) показывает, что `runtime` и `capabilities` через `ledger/view` не достают `openLines` и `Rows`.
4. Хелперы `landing.test.ts` заменяются `openTail`.

## Тесты и фикстуры

- Новых rule ID нет. Фикстура `LG-23/trigger/directory-on-main` переходит со строки `knowledge` таблицы `checks.ts` на `openTail`, а если строка остаётся чистой — на функцию, которую зовёт `openTail`.
- Тесты `landing.test.ts` и e2e остаются зелёными без правки ожиданий.

## Готово, когда

- [ ] последовательность «store на tail `main`» живёт в одном модуле; `tailView`, `tailOf` и тестовые копии удалены
- [ ] отказ LG-23 «каталог на `main`» выдаёт `openTail`
- [ ] вход `ledger/view` — только `View` и `createView`; тест структуры это показывает
- [ ] `npm run verify` зелёный

## Риски и заметки

- **Триггер ST-15:** правка `src/ledger/index.ts` и `src/assembly/index.ts` — файлов skeleton. Отметка в разделе PR «Триггеры ST-15».
- S0-33 и S0-34 зависят от этой задачи: обе правят landing, а PR-17 не даёт менять один контракт параллельно.
