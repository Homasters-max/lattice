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
- `package.json`: пакет `lattice`, `"type": "module"`, `engines.node >= 22.12` (этого требует vitest 5), `bin.lattice` → `dist/cli/main.js`; скрипты `typecheck`, `test`, `lint`, `lint:ids`, `lint:eol`, `plan:check`, `build` и `verify` — все проверки одной командой; на `npm run verify` ссылается `AGENTS.md` как на определение «зелёного». `build` получает вход вместе с `src/cli` в S0-03 и до тех пор в `verify` не входит;
- `tsconfig.json` по D-01 (TypeScript 6.0: typescript-eslint поддерживает `< 6.1`, а 7.0 — нативный порт без compiler API, нужного D-07); `tsconfig.build.json` — сборка `src` в `dist`; vitest и fast-check (D-03); ESLint flat config с лимитами профиля качества, написанными руками (Q-08); строки функции и файла считаются без пустых строк и комментариев;
- `scripts/check-eol.mjs` (`npm run lint:eol`): отслеживаемые текстовые файлы — LF в индексе и рабочей копии, `docs/design` в рабочей копии побайтно равен индексу;
- `test/tools/lint-ids.test.ts`: `lint-ids` отказывает на нарушениях RM-01 и RM-02 и пропускает чистый дизайн;
- CI (Q-01): матрица ubuntu + windows, Node 22: `node discussion/tools/lint-ids.mjs`, `node plan/tools/plan-check.mjs`, окончания строк `docs/design`, typecheck, lint, test.

Не входит: папки модулей и тест структуры (S0-03), соглашения кода (S0-02).

## Шаги

1. Репозиторий на GitHub, CI — GitHub Actions (Q-01).
2. Создать конфигурацию, `npm install`, пустой smoke-тест.
3. Добавить в CI `lint-ids` — он держит RM-01 и RM-02 (одно определение на ID, ссылки только на существующие ID, диапазоны без дыр).
4. Убедиться, что CI зелёный на обеих ОС; отдельным шагом на обеих ОС проверить `git ls-files --eol docs/design` и байты рабочей копии (`scripts/check-eol.mjs`).

## Готово, когда

- [x] репозиторий на GitHub с историей; `main` меняется только через PR с зелёным CI, merge — владелец; метка `blocked` для PR, ждущих ответа. Защита ветки на GitHub не включена: по решению владельца (2026-10-06) это договорённость, а merge он одобряет в чате
- [x] CI зелёный на ubuntu и windows; `lint-ids` и `plan-check` в нём — отдельные шаги
- [x] `docs/design/*.md` в рабочей копии на windows — LF, байты совпадают с исходными
- [x] `npm run verify` локально запускает то же, что CI, и зелёный

## Риски и заметки

- `core.autocrlf=true` у владельца на Windows: `.gitattributes` должен прийти в первом же коммите, иначе файлы попадут в индекс с CRLF.
- Лимиты ESLint временные: с SW конфиг генерируется из блока профиля (ST-09, S0-28).
