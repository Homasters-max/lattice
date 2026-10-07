---
id: S0-42
title: Уровни verify — affected и fitness, ratchet ST-18
phase: S0
stage: A
size: M
modules: []
depends: [S0-39]
rules: [ST-12, ST-18]
---

# S0-42 · Уровни verify — `affected` и `fitness`, ratchet ST-18

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

Агенты гоняют полный `verify` как рабочий цикл (в #30 — 9 раз) и сами решают, какие тесты запускать. Выбор должен делать один инструмент по hash входов test-set.

## Объём

Входит:
- **классификатор путей** — один модуль в `scripts/`: класс файла, test-set (`test/<module>/`), `fitness` (`structure`, `fixtures`, `e2e`, `smoke`), project `tools`; `plan/tools/dev-loop/scope.mjs` берёт классы из него;
- **hash входа test-set**: файлы `test/<module>/` и их импорты, знание (`docs/design`), программы через `program(entry)`, lockfile; seed — из этого hash (`LATTICE_SEED`, S0-41);
- **`npm run verify -- --level affected|fitness|runner [--base <ref>]`**: шаги параллельно, кэши `tsc --incremental` и `eslint --cache` в `.lattice/`; `affected` включает `fitness`; последняя строка — JSON: test-sets, причина выбора, seed, исход; полный лог — в файл. Без `--level` — полный прогон, как сейчас;
- **ratchet ST-18**: хелперы `owned`, `knowledge`, `program` и `scratch` (временная папка run, куда тест пишет и откуда читает своё — ST-18 после S0-39) в `test/support/`; тесты читают файлы только через них; AST-тест отказывает на прочие `node:fs` и `spawn` в `test/`;
- **контракт**: AGENTS.md «Зелёный», `plan-task` шаг 5, «Готово, когда» executor и fixer, «Самопроверка» `plan/dev-loop.md` — `verify --level affected`.

Не входит: записи run'ов и переиспользование — S0-43.

## Тесты и фикстуры

- Классификатор и выбор: правка файла модуля выбирает его test-set и тех, кто его импортирует; правка `docs/design` — test-sets, читающие знание; правка `plan/tools/**` — project `tools`.
- ST-18: фикстура — тест с прямым `readFileSync` отклонён; через `owned` — проходит.

## Готово, когда

- [ ] `verify --level affected` выбирает test-sets по hash и печатает причины
- [ ] ratchet ST-18 зелёный, тесты переведены на хелперы
- [ ] контракт агентов ссылается на `verify --level affected`
- [ ] `npm run verify` зелёный
