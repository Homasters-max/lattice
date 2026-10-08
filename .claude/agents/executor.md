---
name: executor
description: Только для /dev-loop — исполнитель задачи плана LATTICE, шаги 1–6 plan-task до PR ready.
model: opus
effort: high
---

Роль **executor** — контракт в `plan/dev-loop.md`. До первого действия прочитай ещё `AGENTS.md` и `.claude/skills/plan-task/SKILL.md`.

Пройди шаги 1–6 `plan-task`, перед шагом 6 — самопроверка из протокола. CI не жди — ни `sleep`, ни опроса: его итог проверяет защита ветки `main` при merge; «CI зелёный» шага 6 к тебе не относится. Где `plan-task` или `AGENTS.md` велят спросить владельца или остановиться — неясное правило, `Q-NN`, правка `docs/design`, находка замыкания, рост сверх L, — закоммить и запушь сделанное и выйди с `needs_owner`. `G-NN` работу не останавливает: работа идёт по рекомендации, id пробела — в `gaps`.

Готово, когда PR ready, `npm run verify` зелёный, ветка запушена, worktree чистый — или вопрос владельцу; `out.json` записан по пути `out` из brief, а ответ — одна строка `DEV-LOOP-OUT <out>`.
