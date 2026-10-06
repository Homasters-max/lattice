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
- **Детерминированные адаптеры** `clock-fixed`, `ids-counter` (ST-07), плюс тонкие `store-memory`, `store-jsonl` (Q-09), `git-fixture`, `acts-fixture`.
- **Таблица команд** RT-32 / RT-Z03: `init`, `draft`, `land`, `verify-store`, `export`, `migrate`, `session` — заглушки, которые называют задачу, где команда появится; команды поздних срезов отсутствуют.
- **Сквозной путь**: proposal из фикстуры (тип `demo/note` через мета-тип и блок `demo/hello` в одном коммите, LG-11) → `lattice land --dry-run` → отказ с rule ID и его фикстурой (например, KR-06 на неверный `id`) → исправленный proposal → `lattice land` на `git-fixture` → `store.append(commit, delta)` → `view.current("demo/hello")` возвращает запись.

Не входит: полные canon, schema, apply, fold — только тонкие версии, достаточные для пути; authority и acts — `acts-fixture` всегда «approve».

## Интерфейс

```ts
// src/ledger/ports/*.ts — как сделано; точные типы — в задачах портов (S0-11, S0-19, S0-20).
// Операция с несколькими аргументами берёт один объект с именами аргументов правила (CONVENTIONS.md §1, Q-11).
interface Store { append({ commit, delta, evidence }): Promise<void>;   // commit — каноническая строка от ledger (Q-09)
                  commits(from: number): AsyncIterable<string>; tail(): Promise<string | null>;
                  row(key): Promise<Row | null>; rows(prefix): AsyncIterable<Row>; evidence(hash): Promise<Uint8Array | null> }
interface Git   { tail(ref): Promise<string>; prepare({ request, onto }): Promise<Worktree | Conflict>;
                  push({ worktree, ref, expected, message, trailers }): Promise<"pushed" | "moved"> }
interface Worktree { kind: "worktree"; onto; head; dir; list(dir); read(path): Promise<Uint8Array | null>; remove(path) }
interface Acts  { read(request): Promise<readonly Act[]> }   // Act: verb, target, identity, uri, at, verified
interface Clock { now(): string }   // date-time KR-11
interface Ids   { ulid(): string }

// тонкий путь
parseJson(text, path?): Result<JsonValue>; decodeUtf8(bytes, path?): Result<string>   // KR-10; мягкий разбор — G-16
readProposal(value): Result<Proposal>                                     // LG-09 — поверхностно
proposalPath(files): Result<string>                                       // LG-54
apply(before: View, proposal, acts: LandActs, evidence): Result<Commit>   // фаза 1 — KR-06; prev, request, sig — null (G-14)
fold(view: Rows, commit, evidence): Delta                                 // строка current:<id>
openView(store): Promise<Result<{ view, tail }>>                          // fold с начала при открытии
land(ports, request, { dryRun }): Promise<LandingOutcome>                 // worktree → append jsonl → удалить proposal → push
assemble(config): { land(request, options), view() }                      // config называет тестовые адаптеры и jsonl
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

Раскладка, как сделано: тест структуры — `test/structure/`: матрица как данные `modules.ts`, разбор `tree.ts` и `imports.ts`, аудиты `audit-imports.ts`, `audit-purity.ts`, `audit-kernel.ts`; кейсы на виртуальных деревьях — `matrix.test.ts` (сверка с таблицей ST-01 и все пары модулей), `imports.test.ts`, `boundaries.test.ts`, `purity.test.ts`, `kernel.test.ts`; репозиторий — `repo.test.ts`. Фикстуры — `test/fixtures/{KR-06,KR-10,LG-09,LG-54}/`. Порты — `test/contract/{clock,ids,store,git,acts}.test.ts`; landing — `test/ledger/landing.test.ts`; e2e — `test/e2e/skeleton.test.ts`; команды — `test/cli/commands.test.ts`.

## Сделано иначе, чем в наброске

Решения владельца по ревью — Q-09…Q-12 в `PLAN.md`.

- **Знание в git** (Q-09): кроме `store-memory` есть тонкий `store-jsonl` — одна каноническая строка на коммит в `store/knowledge.jsonl`, чтение с начала при открытии. Landing открывает его на worktree: worktree → `append` → удалить proposal → `push`. Worktree `git-fixture` — временный каталог, `push` фиксирует его содержимое; `prepare` сливает по общему предку и кончается `conflict`. Адаптер store canon не знает: ledger отдаёт строку коммита и сам разбирает строки. Read view в e2e открывается из tail `main`. Проверки цепочки, обрезанной строки, evidence в `store/evidence/` и строки, переданные адаптеру при открытии, — S0-11; CAS с пересборкой, `awaiting-act`, trailers OB-07, `request` и `git-repo` — S0-20.
- **Отказы вместо исключений** (Q-10): KR-10 (не JSON, не UTF-8), LG-09 (форма proposal поверхностно; полная — S0-10), LG-54 (ровно один proposal) — с реестрами и фикстурами trigger/pass. Мягкий `JSON.parse` — только в `parseJson` (G-16, до S0-04).
- **Аргументы портов** (Q-11): `prepare`, `push` и `append` берут один объект с именами аргументов правил; правило — `CONVENTIONS.md` §1.
- **`prev` коммита** дописывает landing, `request` — `null` до S0-20 (G-14, Q-12).
- **Канонический порядок** (LG-06, LG-10): hash proposal и records коммита — по сущностям, затем событиям, по `id`; группа фактов по ключу — S0-10.
- **`acts-fixture`** отдаёт acts из конфигурации по change request, а не «всегда approve»: e2e даёт `approve` на каждый change request, apply acts не читает до S0-17; разрешающего умолчания у адаптера нет.
- **Файлы skeleton** (ST-15) — по R9 плана: интерфейсы портов, таблица команд с `stubs.ts`, `src/cli/main.ts`, `src/kernel/version.ts`, точки входа `src/<module>/index.ts` и весь тест структуры. `kernel-files.txt` в список не входит: его дополняет каждая задача ядра (ST-05).
- **Заглушки команд** — `src/cli/stubs.ts`, отдельно от таблицы `src/cli/commands.ts`.
- **Исправленный proposal** e2e — второй change request `cr/good` с фикстурой `pass`, а не правка первого.
- **KR-01** ловит строковые литералы, называющие `std` или его тип, и идентификаторы, названные по типу `std` (`Requirement`, `reviewNote`, `NAMESPACE`).
- **`Rejection.expected` и `got`** — `JsonValue`, а не `unknown`: сообщение подставляет их каноническим JSON; набросок `CONVENTIONS.md` §3 поправлен.
- **Чистота** строже раздела 8 `CONVENTIONS.md`: `import.meta` целиком, `globalThis`, `require`, `Buffer`, глобальный `crypto`, `Date()` как функция — пути к окружению и файлам ST-04; раздел дописан.

## Готово, когда

- [x] все папки модулей S0 есть, тест структуры кодирует всю матрицу ST-01 и зелёный
- [x] интерфейсы пяти портов S0 существуют, у `clock` и `ids` есть детерминированные адаптеры
- [x] `lattice --help` показывает команды S0; вызов заглушки называет задачу плана
- [x] E2E: `land --dry-run` с отказом и rule ID → `land` → `append` с delta → ответ read view
- [x] список файлов skeleton записан

## Риски и заметки

- Skeleton должен быть тонким (R9): чем меньше в нём логики, тем реже аудит.
- Задача затрагивает все модули — по ST-15 после неё архитектурный аудит не нужен (это начало), но владелец ревьюит её как базу.
