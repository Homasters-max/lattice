---
id: S0-43
title: dl gate — runner цикла и записи run'ов verify
phase: S0
stage: A
size: M
modules: []
depends: [S0-42]
rules: [ST-12]
---

# S0-43 · `dl gate` — runner цикла и записи run'ов verify

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

Сейчас «Ворота» — `npm run verify`, который запускает модель-оркестратор, и полный прогон после каждого агента на том же head. Доказательство должна писать детерминированная программа (PR-09, TR-43), и зелёное не должно перепроверяться.

## Объём

Входит:
- **`dl gate --worktree W`**: гонит `verify --level runner`, пишет записи `.lattice/verify-runs/<hash ключа>.json` в рабочей копии владельца — `{test_set, code, knowledge, tools, environment: {os, node, git}, seed, outcome: ok|failed|budget-exceeded, failed, ms, head, at}` — и печатает одну строку JSON с `next`;
- **shadow**: gate гонит всё и пишет, что пропустил бы по записям; расхождение — в выводе и в итоге цикла. Пропуск включается решением владельца после двух задач без расхождений;
- красный gate — brief `verify-red` получает из записей список test-sets, тестов, seed и исход;
- `dl start` удаляет записи старше 30 дней;
- `.claude/skills/dev-loop/SKILL.md`, «Ворота» — `dl gate`.

Не входит: переиспользование в CI — этап B, отдельная задача по итогам shadow; мутации — S0-44.

## Готово, когда

- [ ] «Ворота» — `dl gate`; записи пишет только он
- [ ] shadow-сравнение в выводе gate
- [ ] `verify-red` получает список из записей
- [ ] `npm run verify` зелёный
