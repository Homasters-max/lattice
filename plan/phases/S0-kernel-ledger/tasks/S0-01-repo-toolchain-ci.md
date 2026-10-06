---
id: S0-01
title: Репозиторий, toolchain и CI-каркас
phase: S0
stage: A
size: S
modules: []
depends: []
rules: [RM-01, RM-02]
---

# S0-01 · Репозиторий, toolchain и CI-каркас

## Зачем

Всё дальнейшее — change units, проверяемые в CI (SL-01, PR-15). Нужен репозиторий, где побайтный round-trip не ломается на Windows, а CI с первого дня запускает уже существующие проверки дизайна.

## Объём

Входит:
- `git init`, ветка `main`; первый коммит — текущие `docs/`, `discussion/`, `plan/`;
- `.gitattributes`: `* text=auto eol=lf`, явно `*.md`, `*.json`, `*.jsonl` — `text eol=lf` (D-10); проверка, что `git ls-files --eol` показывает `i/lf w/lf` для `docs/design`;
- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `gen/`, `.lattice/` (LG-50, ST-08), `.obsidian/workspace.json`;
- `package.json`: пакет `lattice`, `"type": "module"`, `engines.node >= 22`, `bin.lattice`; скрипты `typecheck`, `test`, `lint`, `lint:ids`, `plan:check`, `build` и `verify` — все проверки одной командой; на `npm run verify` ссылается `AGENTS.md` как на определение «зелёного»;
- `tsconfig.json` по D-01; vitest и fast-check (D-03); ESLint flat config с лимитами профиля качества, написанными руками (Q-08);
- CI (Q-01): матрица ubuntu + windows, Node 22: `node discussion/tools/lint-ids.mjs`, `node plan/tools/plan-check.mjs`, typecheck, lint, test.

Не входит: папки модулей и тест структуры (S0-03), соглашения кода (S0-02).

## Шаги

1. Репозиторий на GitHub, CI — GitHub Actions (Q-01).
2. Создать конфигурацию, `npm install`, пустой smoke-тест.
3. Добавить в CI `lint-ids` — он держит RM-01 и RM-02 (одно определение на ID, ссылки только на существующие ID, диапазоны без дыр).
4. Убедиться, что CI зелёный на обеих ОС; на windows отдельным шагом проверить `git ls-files --eol docs/design`.

## Готово, когда

- [ ] репозиторий на GitHub с историей; `main` меняется только через PR с зелёным CI, merge — владелец; метка `blocked` для PR, ждущих ответа
- [ ] CI зелёный на ubuntu и windows; `lint-ids` и `plan-check` в нём — отдельные шаги
- [ ] `docs/design/*.md` в рабочей копии на windows — LF, байты совпадают с исходными
- [ ] `npm run verify` локально запускает то же, что CI, и зелёный

## Риски и заметки

- `core.autocrlf=true` у владельца на Windows: `.gitattributes` должен прийти в первом же коммите, иначе файлы попадут в индекс с CRLF.
- Лимиты ESLint временные: с SW конфиг генерируется из блока профиля (ST-09, S0-28).
