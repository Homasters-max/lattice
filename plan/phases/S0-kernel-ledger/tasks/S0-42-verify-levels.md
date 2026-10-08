---
id: S0-42
title: prove — доказательство затронутого, ratchet ST-18
phase: S0
stage: A
size: M
modules: []
depends: [S0-47]
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
- **контракт**: AGENTS.md «Зелёный», `plan-task` шаг 5, «Готово, когда» executor и fixer, «Самопроверка» `plan/dev-loop.md` — `npm run prove` зелёный; итог читается из JSON последней строки, без `| tail`.

Не входит: мутации и `--ready` — S0-44; записи run'ов, ворота по ключам — S0-43.

## Тесты и фикстуры

- Классификатор и выбор: правка файла модуля выбирает его test-set и тех, кто его импортирует; правка `docs/design` — test-sets, читающие знание; правка `plan/tools/**`, `scripts/**` или `discussion/tools/**` — project `tools`.
- `prove`: красный test-set даёт ненулевой код выхода и `outcome: failed` в последней строке; причина выбора названа у каждого test-set.
- ST-18: фикстура — тест с прямым `readFileSync` отклонён; через `owned` — проходит.

## Готово, когда

- [ ] `npm run prove` выбирает test-sets по hash и печатает причины одной JSON-строкой
- [ ] ratchet ST-18 зелёный, тесты переведены на хелперы
- [ ] контракт агентов ссылается на `npm run prove`
- [ ] `npm run verify` зелёный
