---
id: S0-20
title: Порт git и landing — land и land --dry-run
phase: S0
stage: G
size: L
modules: [ledger, adapters, assembly, cli]
depends: [S0-13, S0-11, S0-19]
rules: [LG-20, LG-22, LG-23, LG-24, LG-25, LG-26, LG-28, LG-29, LG-53, GL-09, RT-32]
---

# S0-20 · Порт git и landing — land и land --dry-run

## Зачем

Commit `knowledge` рождается в git через landing (LG-22): git решает порядок, store следует за ним (NX-16). Это шов, где сходятся apply, acts, store и git.

## Объём

Входит:
- **порт `git`** (LG-23): `tail(ref)`; `prepare(request, onto) → worktree | conflict`; `push(worktree, ref, expected, message, trailers) → pushed | moved` — compare-and-swap по `expected`; в коде `prepare` и `push` берут аргументы одним объектом (`CONVENTIONS.md` §1, Q-11);
- **`git-repo`** (D-08): CLI `git`, worktree, merge, локальный CAS `git update-ref`; **`git-fixture`**;
- **landing** в `machine`-сессии `land` (LG-22): событие land session в коммите (participant `land`, purpose `work`, `for` — reason сессии proposal); acts через порт → `act`-события; apply на tail; один git-коммит — merge change request в tail `main` со вторым родителем — head change request, с append в `store/knowledge.jsonl` через адаптер `jsonl` на worktree, evidence в `store/evidence/`, удалённым файлом proposal; без записи `docs/` до SW (PLAN.md, раздел 2);
- **trailers**: `Lattice-Session`, `Lattice-Reason` сессии proposal; `Lattice-Step` — id, выданный портом `ids` (сам step записывается с S1, LG-28); `Lattice-Proposal`, `Lattice-Seq`;
- **сдвиг `main`** (LG-24): пересборка из proposal на новом tail, не больше N раз (константа версии), затем `moved`; отказ на новом tail — rejections; конфликт кода — `conflict`;
- **исходы** (LG-25): `commit`, `no-op` (git-коммит без commit `knowledge`, удаляет proposal и несёт код change request), `rejections`, `moved`, `conflict`; повтор hash proposal — тот же commit (G-04);
- **`--dry-run`** (LG-26): всё, кроме push; `awaiting-act` вместо отказа «нет act»; `after` как если бы ожидаемые acts пришли; отчёт по intent — класс эволюции, удалённые ссылки, изменённые поля;
- **версия** (LG-53): landing исполняет версию LATTICE, закреплённую в `before`; иначе отказ;
- **секреты** (LG-20): проверка до apply по зарегистрированным секретам; canary-тест;
- **S0 — локальный landing владельцем** при `forge: none` (LG-28, GL-09); landing в CI по act — позже;
- команды `lattice land` и `lattice land --dry-run`.

## Тесты и фикстуры

LG-29 на `git-fixture` и `acts-fixture`: dry-run без acts → `awaiting-act`; landing — один git-коммит с кодом, append jsonl, evidence, удалённым proposal и trailers; сдвиг `main` → пересборка, после N попыток `moved`; изменённый `expected` → rejections; конфликт кода → `conflict`; no-op; повтор hash → тот же commit; merge со вторым родителем — head change request. Плюс те же сценарии на `git-repo` во временном репозитории.

## Готово, когда

- [ ] сюита LG-29 зелёная на `fixture` и на `repo`
- [ ] `lattice land --dry-run` и `lattice land` работают в локальном репозитории с `local` acts
- [ ] canary LG-20: подброшенный секрет не найден ни в store, ни в evidence, ни в сообщениях
- [ ] landing берёт время и id только из портов `clock` и `ids`

## Риски и заметки

- Задача на четыре модуля — триггер аудита ST-15; кандидат на деление: «порт `git` и адаптеры» отдельно от «landing и `--dry-run`».
- От S0-03 (Q-09, Q-12): тонкий landing уже есть — worktree → `append` через `jsonl` → удалить proposal → `push`; worktree `git-fixture` — временный каталог, `prepare` сливает по общему предку и кончается `conflict`; `prev` дописывает landing (G-14), `request` — `null`. Задача добавляет пересборку на сдвинутом `main` (CAS, LG-24), `awaiting-act` и отчёт dry-run (LG-26), land session и `act`-события, trailers OB-07, `request` — `uri` change request, `git-repo`; LG-54 уже отказывает (`proposalPath`, `test/fixtures/LG-54/`).
- От S0-03 (ревью, волна 2): `before` складывается из store на worktree tail-коммита `main` (LG-14), а store change request только сверяется с ним — `keptKnowledge`, отказ LG-23, если change request сам изменил `store/knowledge.jsonl`; `append` идёт в store на worktree change request. Порт `git`: `tail(ref)` — `null`, когда ref нет, и landing отклоняет такой change request LG-54 (`changeRequest`, Q-16); `prepare` берёт только найденные `tail` ref. `git-repo` держит тот же контракт — сюита `test/contract/git.test.ts`. Trailers `Lattice-Proposal` и `Lattice-Seq` (LG-22) уже ставятся; задача добавляет trailers OB-07. С волны 3 (Q-19) LG-23 сверяет байты `store/knowledge.jsonl` в worktree tail и change request (`Worktree.read`), а proposal без intents садится `no-op` (LG-25): без коммита знания, файл proposal удалён, код change request в git-коммите; задача добавляет к нему отчёт dry-run и идемпотентность по hash (LG-12).
- От разбора S0-03 (2026-10-07): после S0-34 у `Worktree` есть `release()` (LG-23, D206) — `git-repo` держит этот контракт: каждый `git worktree`, который вернул `prepare`, удаляется на `push` или `release`. Пересборка на сдвинувшемся `main` (LG-24) берёт tail через `openTail` (S0-32); конфликт на файле store — отказ LG-23 (Q-28, S0-33).
- От S0-10: `chainTo(candidate, tail)` (бывший `onTail` landing) и `signCommit(c, landKey)` — в `src/ledger/commit.ts`; landing подписывает коммит ключом land session после `chainTo`, тогда `verifyChain` (S0-11) принимает store, который пишет landing. Порядок, в котором landing формирует коммит, повторяет `test/support/chain.ts`.
- От S0-11 (Q-39, вариант B): операция открытия store `openStore(store, keyOfSession)` и её чистое ядро `openLines(lines, keyOfSession)` в `src/ledger/chain.ts` проверяют подписи LG-06, когда им дан `keyOfSession`. До этой задачи оба вызывающих в `src/` — `openTail` (`src/ledger/tail.ts`) и `storeOn` landing (store на worktree change request, `src/ledger/landing.ts`) — зовут `openStore` с `null` и проверяют всё, кроме подписей, потому что landing пишет коммиты с `sig: null`. Задача включает подписи в обоих вместе с подписью landing: `TailPorts` получает `keyOfSession` — ключи сессий из событий land session с сертификатом (LG-22, TR-11), — `null` уходит из `openTail` и `storeOn`, а тесты landing и `test/ledger/tail.test.ts` открывают подписанный store.
- От S0-12 (G-51, решение владельца 2026-10-09): до этой задачи все три вызова открытия store — `openTail`, `storeOn` и `verifyStore` (`lattice verify-store`) — зовут `openLines`/`openStore` с `null`: подписи не проверяются, вывод `verify-store` говорит «signatures not checked». Задача решает, откуда открытие store берёт ключ land session для LG-05, — через `verifySession` trust (TR-12, TR-11), не чтением `certificate.key` в ledger: чья policy перечисляет участника `land` (namespace), какой view — `before` коммита (TR-06), как открывается genesis, у которого policy ещё нет; и подключает ключи во все три вызова, `verify-store` — с выводом о подписях. `id` land session `LAND` тестов (`test/support/chain.ts`) — не ULID, и его событие apply не примет (KR-06).
- От S0-12 (ревью W2-S2): view отвечает `evidence(hash)` (LG-38) байтами только тех файлов, что ему переданы (`viewOf`, `createView`); `openLines` и `openStore` передают fold и view пустой список и `Store.evidence` не читают, так что view открытого store на любой hash отвечает `null`. Когда landing пишет evidence коммита в store (LG-30, LG-02), открытие store передаёт fold и view файлы, которые коммиты цитируют, из `Store.evidence`; если в S0 ни один коммит evidence не цитирует (RF-03, `cite` — позже), задача переносит это в план той фазы, где появляется `cite`.
- От архитектурного разбора, волна 2 (2026-10-07): последовательность `chainTo` → `signCommit` → `encodeCommit` (с S0-11 — `commitLine`) сейчас целиком написана только в `test/support/chain.ts`. Задача делает её одной операцией модуля цепочки — «следующий коммит на этом tail, подписанный land session» (вторая операция — «строки → проверенный tail», S0-11): landing, `test/support/chain.ts` и фикстуры LG-04…LG-06 зовут её, а шаги перестают быть публичными. Trailer `Lattice-Proposal` landing берёт из исхода apply (S0-13), а не считает hash proposal сам.
- От S0-19 (G-55): landing уже читает acts через порт один раз и пишет каждый `act`-событием коммита (`landActs` в `src/ledger/landing.ts`: `id` из порта `ids`, `by` — land session, `at` — время landing); задача добавляет событие самой land session, к которому они отнесены. `acts-recorded` берёт коммит, который приземлил change request, по имени change request; когда landing заполнит `request` коммита, вызывающий находит коммит по нему. У `no-op` acts не пишутся — коммита нет.
