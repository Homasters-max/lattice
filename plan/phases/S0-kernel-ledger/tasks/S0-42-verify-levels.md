---
id: S0-42
title: prove — доказательство затронутого, ratchet ST-18
phase: S0
stage: A
size: M
modules: []
depends: [S0-47, S0-48]
rules: [ST-12, ST-18]
---

# S0-42 · `prove` — доказательство затронутого, ratchet ST-18

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

Агенты гоняют полный `verify` как рабочий цикл: 106 полных прогонов на 13 циклах, 82 мин; в 8 из 13 повторов на неизменённом дереве второй прогон шёл только ради кода выхода, который скрыл `| tail`. Что доказывать, должен решать один инструмент по hash входов test-set, а агенту нужна одна команда (решение владельца 2026-10-08).

## Объём

Входит:
- **классификатор путей** — один модуль в `scripts/`: класс файла, test-set (`test/<module>/`), `fitness` (`structure`, `fixtures`, `e2e`, `smoke`), project `tools` — по `plan/tools/**`, `scripts/**` и `discussion/tools/**`; `plan/tools/dev-loop/scope.mjs` и сборка brief (S0-48) берут классы из него;
- **hash входа test-set**: файлы `test/<module>/` и их импорты, знание (`docs/design`), программы через `program(entry)`, lockfile; seed — из этого hash (`LATTICE_SEED`, S0-41);
- **`npm run prove [--base <ref>]`** — `scripts/prove.mjs` поверх `scripts/verify.mjs` (S0-47): затронутые test-sets и весь `fitness`; последняя строка — JSON: test-sets, причина выбора каждого, seed, исход; полный лог — в файл; код выхода — итог. `npm run verify` остаётся полным прогоном;
- **ratchet ST-18**: хелперы `owned`, `knowledge`, `program` и `scratch` (временная папка run, куда тест пишет и откуда читает своё — ST-18 после S0-39) в `test/support/`; тесты читают файлы только через них; AST-тест отказывает на прочие `node:fs` и `spawn` в `test/`; он входит в `structure` уровня `fitness`, потому что ST-18 сам называет его проверкой «on every change request (ST-12)». Перечень fitness-тестов в ST-12 ST-18 не называет (ревью S0-39, W1-T1); дописать его туда можно только решением владельца — исполнитель выносит это в «Открытое» PR;
- **контракт** — везде, где агенту названа проверка, `npm run prove` зелёный; итог читается из JSON последней строки, без `| tail`: `AGENTS.md` «Зелёный»; `plan-task` шаги 5 и 7; тела `.claude/agents/executor.md` и `fixer.md` (S0-48) — «Готово, когда»; `reviewer-standards.md` — «что ловит `prove`, вне оси»; `plan/dev-loop.md`; карта «класс путей → строки ST» из S0-48 переезжает в классификатор.

Не входит: мутации и `--ready` — S0-44; записи run'ов, ворота по ключам — S0-43.

Как сделано (исполнитель):
- классификатор — `scripts/paths.mjs` (типы для тестов — `paths.d.mts`): `classOf` и `ST_BY_CLASS` переехали из `scope.mjs`, `testSetOf` (файлы в корне `test/` — `smoke`), `FITNESS`, `isTool` и `owns` — решение «набор владеет путём», по которому `owned` отказывает и по которому `prove` считает owned-входы. Чем test set владеет сверх своей папки — файлы, которые его тесты читают как данные (G-30): `cli` — `src/` и конфиги сборки, `codec` — `src/` (аудиты через `repoTree`), `kernel` — `test/vectors/`, `support` — `test/`, `tools` — `plan/`, `scripts/`, `discussion/tools/`, `.claude/`, `AGENTS.md`, `CONVENTIONS.md` и два файла `test/`, которые называют документы цикла; fitness-наборы владеют всем репозиторием;
- hash test set — git blob (текст с LF) каждого входа: owned-файлы, импорты файлов `test/<set>/` и конфига прогона (`package.json`, lockfile, `tsconfig.json`, `vitest.config.ts`, setup из `test/support/`) транзитивно, программы `program("<entry>")` с их импортами, `docs/design`, если файл набора импортирует `knowledge`. Набор идёт, если hash по рабочему дереву отличается от hash на merge base; причина — изменившиеся входы с видом (`owned`, `import`, `program`, `knowledge`, `config`). Наборы одного hash (все fitness) идут одним прогоном vitest; прогоны vitest идут друг за другом, рядом с прочими шагами `verify` (`runSteps` и `queue` в `scripts/verify.mjs`);
- хелперы — `test/support/files.ts` (`owned`, `knowledge`, `scratch`) и `test/support/program.ts` (`program`: node-программа проекта, программа, собранная тестом в своём `scratch`, или инструмент окружения — `git`); `owned` знает test set по выполняемому файлу теста (`expect.getState().testPath`) и отказывает с ST-18 на чужой файл;
- AST-тест ST-18 — `test/structure/audit-reads.ts` и `reads.test.ts`; его trigger и pass — случаи в самом тесте, как у прочих проверок ST: папки `test/fixtures/<RULE-ID>/` — для rule ID из реестров `src/**/rules.ts` (ST-17, `coverage.ts`);
- сверх объёма — `CONVENTIONS.md` §7.2 изменён под ST-18: пункт разрешал тестам `node:fs`, теперь `node:fs` — только скриптам, а тест берёт файлы и программы через хелперы `test/support/`, что держит тест структуры. Решение за владельцем («Открытое» PR #48);
- сверх объёма — S0-48 закрыта в этой ветке по смёрженному #47: ✅ и ссылка на доске, пункты «Готово, когда» отмечены `[x]` в её файле. На `main` она осталась ⬜, и `plan-check` не принимал S0-42 ✅ с незавершённой зависимостью.

## Тесты и фикстуры

- Классификатор и выбор: правка файла модуля выбирает его test-set и тех, кто его импортирует; правка `docs/design` — test-sets, читающие знание; правка `plan/tools/**`, `scripts/**` или `discussion/tools/**` — project `tools`.
- `prove`: красный test-set даёт ненулевой код выхода и `outcome: failed` в последней строке; причина выбора названа у каждого test-set.
- ST-18: фикстура — тест с прямым `readFileSync` отклонён; через `owned` — проходит.

## Готово, когда

- [x] `npm run prove` выбирает test-sets по hash и печатает причины одной JSON-строкой
- [x] ratchet ST-18 зелёный, тесты переведены на хелперы
- [x] контракт агентов ссылается на `npm run prove`
- [x] `npm run verify` зелёный
