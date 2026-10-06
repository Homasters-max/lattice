---
id: S0-03
title: Walking skeleton
phase: S0
stage: B
size: L
modules: [kernel, trust, ledger, codec, generate, adapters, assembly, cli]
depends: [S0-02]
rules: [SL-05, ST-01, ST-02, ST-04, ST-05, ST-06, ST-07, KR-01, KR-02, KR-03, RT-32, LG-23, PR-13]
---

# S0-03 · Walking skeleton

## Зачем

SL-05: срез начинается с одной тонкой change unit через все швы. После неё фаза растёт параллельными задачами по контрактам. Skeleton фиксирует границы модулей, интерфейсы портов и таблицу команд — всё, что потом меняется только с аудитом (ST-15).

## Объём

Входит:
- **Папки модулей S0**: `kernel`, `trust`, `ledger` (с `ports/`), `codec`, `generate`, `adapters/*`, `assembly`, `cli`. Папок `evidence`, `measure`, `runtime`, `capabilities` нет.
- **Тест структуры** (ST-04…ST-06, D-07) с полной матрицей ST-01 всех 12 модулей: направление импортов, отсутствие циклов, адаптеры не импортируют друг друга, vendor SDK только в своём адаптере, порт `judge` только в `decide`, импорт `codec` и `generate` только из `assembly` и `cli`, адаптеры — только из `assembly`; запрет кода другого проекта, кроме закреплённой библиотеки (PR-13).
- **Чистота** (ST-04, KR-02): вне `adapters`, `assembly`, `cli` запрещены `node:fs`, `node:net`, `node:http(s)`, `node:child_process`, `node:os`, `process`, `Date.now`, `new Date()` без аргумента, `Math.random`, `crypto.randomUUID`, `crypto.randomBytes`, `performance.now`. Из `node:crypto` в чистом коде — только `createHash`, `verify`, `sign`, `createPublicKey`, `createPrivateKey`.
- **Периметр ядра** (ST-05, KR-01): `test/structure/kernel-files.txt` — всё, что достижимо из точки входа ядра; лишний файл валит тест. Тест на имена типов `std` в коде ядра — список имён берётся из исходников `std` (до S0-08 — из TY-Z02…TY-Z05).
- **Версия ядра** `0` — константа (KR-03).
- **Сборка**: `src/cli/main.ts` — вход `npm run build` и `bin.lattice` (`dist/cli/main.js`); с ним `build` входит в `npm run verify` и в CI (из S0-01).
- **Интерфейсы портов** `store`, `acts`, `git`, `clock`, `ids` (LG-02 — часть `knowledge`, LG-23).
- **Детерминированные адаптеры** `clock-fixed`, `ids-counter` (ST-07), плюс тонкие `store-memory`, `git-fixture`, `acts-fixture`.
- **Таблица команд** RT-32 / RT-Z03: `init`, `draft`, `land`, `verify-store`, `export`, `migrate`, `session` — заглушки, которые называют задачу, где команда появится; команды поздних срезов отсутствуют.
- **Сквозной путь**: proposal из фикстуры (тип `demo/note` через мета-тип и блок `demo/hello` в одном коммите, LG-11) → `lattice land --dry-run` → отказ с rule ID и его фикстурой (например, KR-06 на неверный `id`) → исправленный proposal → `lattice land` на `git-fixture` → `store.append(commit, delta)` → `view.current("demo/hello")` возвращает запись.

Не входит: полные canon, schema, apply, fold — только тонкие версии, достаточные для пути; authority и acts — `acts-fixture` всегда «approve».

## Интерфейс

```ts
// src/ledger/ports/*.ts — как сделано; точные типы — в задачах портов (S0-11, S0-19, S0-20)
interface Store { append(commit, delta, evidence): Promise<void>; commits(from: number): AsyncIterable<Commit>;
                  tail(): Promise<Commit | null>; row(key): Promise<Row | null>; rows(prefix): AsyncIterable<Row>;
                  evidence(hash): Promise<Uint8Array | null> }
interface Git   { tail(ref): Promise<string>; prepare(request, onto): Promise<Worktree | Conflict>;
                  push({ worktree, ref, expected, message, trailers }): Promise<"pushed" | "moved"> }  // один объект: лимит параметров 4
interface Worktree { kind: "worktree"; onto; head; list(dir); read(path): Promise<Uint8Array | null>; write(path, bytes); remove(path) }
interface Acts  { read(request): Promise<readonly ActSource[]> }   // ActSource: verb, target, identity, uri, at, verified
interface Clock { now(): string }   // date-time KR-11
interface Ids   { ulid(): string }

// тонкий путь
apply(before: View, proposal, acts: LandActs, evidence): Result<Commit>   // фаза 1 — KR-06; prev, request, sig — null (G-14)
fold(view: RowView, commit, evidence): Delta                              // строка current:<id>
land(ports, request, { dryRun }): Promise<LandingOutcome>                 // commit | rejections | moved | conflict
assemble(config): { land(request, options), view() }                      // config называет только тестовые адаптеры
run(argv, { out, err, assembled }): Promise<number>                        // cli; bin передаёт assembled: null до S0-23
```

## Шаги

1. Папки и точки входа модулей; тест структуры с матрицей и правилами чистоты — сначала красный на намеренно плохом импорте в фикстуре теста.
2. Интерфейсы портов и детерминированные адаптеры.
3. Тонкие canon, hash, проверка `id`, apply с фазой 1, fold с текущей ревизией, `view.current`.
4. `assembly` из объекта конфигурации; `cli` с таблицей команд.
5. E2E-тест сквозного пути через `cli`.
6. Записать в `test/structure/skeleton-files.txt` файлы, которыми владеет skeleton, — их правка дальше триггер аудита (ST-15).

## Тесты и фикстуры

- `test/fixtures/KR-06/trigger` и `.../pass` — первая пара фикстур и первая строка `test/fixtures/checks.ts`; на них проверяются fitness-тесты покрытия и прогона фикстур из S0-02.
- Типы `RuleId`, `Rule`, `Rejection`, `Result`, конструктор `reject` и реестр `src/kernel/rules.ts` — по наброскам `CONVENTIONS.md`, разделы 2–3, 6; запреты чистоты — его раздел 8.
- Тест структуры падает на: импорте `ledger` из `kernel`; адаптере, импортирующем адаптер; `Date.now()` в `trust`; файле вне списка периметра ядра.

Раскладка, как сделано: тест структуры — `test/structure/`: матрица как данные `modules.ts`, разбор `tree.ts` и `imports.ts`, аудиты `audit-imports.ts`, `audit-purity.ts`, `audit-kernel.ts`; кейсы на виртуальных деревьях — `matrix.test.ts` (сверка с таблицей ST-01 и все пары модулей), `imports.test.ts`, `boundaries.test.ts`, `purity.test.ts`, `kernel.test.ts`; репозиторий — `repo.test.ts`. Порты — `test/contract/clock.test.ts`, `ids.test.ts`; e2e — `test/e2e/skeleton.test.ts`; команды — `test/cli/commands.test.ts`.

## Сделано иначе, чем в наброске

- **Файлы skeleton** (ST-15) — порты, таблица команд, `src/cli/main.ts`, `src/kernel/version.ts` и тест структуры с матрицей. Точки входа `src/<module>/index.ts` в список не входят: это перечни экспорта, их правит почти каждая задача, и каждая стала бы триггером аудита (R9). Границы модулей и их входы держит `test/structure/modules.ts` — он в списке.
- **Заглушки команд** — в `src/cli/stubs.ts`, отдельно от таблицы `src/cli/commands.ts`: задача, которая реализует команду, правит заглушки и обработчики, а не файл skeleton.
- **Исправленный proposal** e2e — второй change request `cr/good` с фикстурой `pass`, а не правка первого.
- **Тонкие места** бросают `not in the walking skeleton: … arrives with S0-NN` (`CONVENTIONS.md` §2): JSON, который не разбирается (KR-10, S0-04); proposal не по LG-09 (S0-10); change request не с одним proposal (LG-54, S0-20).
- **`prev` коммита** дописывает landing, а не apply (G-14); store `memory` не лежит на worktree, поэтому landing пишет в него после `push` — запись в `jsonl` на worktree приходит с S0-20 (LG-23).
- **`Rejection.expected` и `got`** — `JsonValue`, а не `unknown`: сообщение подставляет их каноническим JSON; набросок `CONVENTIONS.md` §3 поправлен.
- **Чистота** строже раздела 8 `CONVENTIONS.md`: `import.meta` целиком, `globalThis`, `require`, `Buffer`, глобальный `crypto`, `Date()` как функция; раздел дописан.

## Готово, когда

- [x] все папки модулей S0 есть, тест структуры кодирует всю матрицу ST-01 и зелёный
- [x] интерфейсы пяти портов S0 существуют, у `clock` и `ids` есть детерминированные адаптеры
- [x] `lattice --help` показывает команды S0; вызов заглушки называет задачу плана
- [x] E2E: `land --dry-run` с отказом и rule ID → `land` → `append` с delta → ответ read view
- [x] список файлов skeleton записан

## Риски и заметки

- Skeleton должен быть тонким (R9): чем меньше в нём логики, тем реже аудит.
- Задача затрагивает все модули — по ST-15 после неё архитектурный аудит не нужен (это начало), но владелец ревьюит её как базу.
