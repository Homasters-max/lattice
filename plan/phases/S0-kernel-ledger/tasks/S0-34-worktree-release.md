---
id: S0-34
title: Жизненный цикл worktree
phase: S0
stage: B
size: S
modules: [ledger, adapters]
depends: [S0-32]
rules: [LG-23, ST-07]
---

# S0-34 · Жизненный цикл worktree

## Зачем

Архитектурный разбор S0-03 (2026-10-07, «Открытое» PR #5): порт `git` не освобождает worktree. `git-fixture` создаёт временный каталог на каждый `prepare`, а убирает его только успешный `push`. Остаётся:
- после успешного `land` — 1 каталог (worktree tail);
- после dry-run, отказа и `moved` — по 2;
- после каждого чтения view — ещё 1.

Тесты прячут это, удаляя родительский каталог. С `git-repo` (S0-20) это будут настоящие `git worktree` на диске. Дешевле поправить порт, пока у него один адаптер.

## Объём

Входит:
- **`Worktree.release()`** (LG-23, D206, Q-30). Повторный вызов ничего не делает; `push` освобождает worktree, который пушит.
- **Landing и `openTail` освобождают каждый worktree, который подготовили**, на любом исходе: `commit`, `no-op`, `rejections`, `moved`, `conflict`, dry-run, исключение.
- **Контракт-тест `test/contract/git.test.ts`**: после `release` и после `push` каталога worktree нет; повторный `release` безопасен.
- **Тест landing**: после каждого исхода в каталоге `git-fixture` не остаётся worktree.
- **Комментарий к `Worktree.list`**: каталог задаётся со слешем в конце (`store/proposals/`).

Не входит:
- сужение полей `Worktree` (`onto`, `head`, `dir`) — точные типы порта в S0-20;
- новая операция checkout: worktree одного коммита остаётся `prepare({request: onto, onto})` внутри `openTail`.

## Интерфейс

```ts
// src/ledger/ports/git.ts
interface Worktree { …; release(): Promise<void> }   // LG-23: каждый worktree, который вернул prepare, освобождается
```

## Шаги

1. Контракт-тест `release` и тест landing «ничего не осталось» — красные.
2. `release` в порту и в `git-fixture`; `finally` в landing и `openTail`.
3. Тест-хелперы, которые оборачивают `git` (`recording`, сдвиг `main` в `landing.test.ts`), передают `release`.

## Тесты и фикстуры

Новых rule ID жёсткой проверки нет: освобождение показывают контракт-тест порта (ST-07) и тест landing.

## Готово, когда

- [ ] у `Worktree` есть `release`, LG-23 в дизайне это говорит (D206)
- [ ] ни один исход landing и чтения view не оставляет worktree; тест это показывает
- [ ] контракт-сюита `git` проверяет `release`
- [ ] `npm run verify` зелёный

## Риски и заметки

- **Триггер ST-15:** правка `src/ledger/ports/git.ts` — файла skeleton. Отметка в PR.
- `git-repo` (S0-20) держит тот же контракт; заметка в S0-20.
