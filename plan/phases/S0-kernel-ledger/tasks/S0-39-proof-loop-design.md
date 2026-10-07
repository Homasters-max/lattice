---
id: S0-39
title: Контур проверки — правки дизайна
phase: S0
stage: A
size: S
modules: []
depends: []
rules: [ST-12]
---

# S0-39 · Контур проверки — правки дизайна

Инструмент контура проверки (PLAN.md, раздел 8, «Контур проверки»); вне лимита SL-06.

## Зачем

Разбор PR #30 нашёл в дизайне места, где контур проверки разошёлся бы с правилами в S1 и S3: code hash (RT-12) не видит файлов, которые тест читает, а не импортирует, — и `ok` verify засчитался бы для delegation (TR-18) после правки фикстуры; детерминизм test-set не задан; сила test-set не измеряется. Правила должны появиться раньше инструментов S0-40…S0-44, которые на них ссылаются.

## Объём

Входит — правки `docs/design` по решениям владельца 2026-10-07 и строки D207 и далее в `discussion/decisions.md`:
- **ST-18** (новое, `13-structure`, раздел «Modules», срез S0): *"A test reads at run time only the files its test set owns (ST-10), knowledge, and the programs of the project it runs as code under test; it runs no other program except the tools its environment names. A structure test checks it."* — формулировку уточняет исполнитель;
- **RT-12**: code hash test-set — файлы, которыми он владеет, и их транзитивные импорты (ST-18);
- **RT-21**: run `std/verify` детерминирован — случайность берёт seed из input fingerprint; бюджет run (RT-19) в счётных единицах, превышение страховки по времени кончает run `budget-exceeded`, не `failed`;
- **LT-31**: мутационное измерение силы test-set; триггер — первая delegation по evidence (S3);
- **LT-32**: окружения, в которых policy требует `ok` verify; триггер — первый проект, чьи runner'ы идут в нескольких окружениях;
- **RM-Z04**: ST-18 в строке «structure and fitness tests»;
- `rules` задачи S0-42 пополняется `ST-18`; `RULES.md` — `plan-check --rules`.

Не входит: код и тесты — S0-40…S0-44.

## Готово, когда

- [ ] ST-18, RT-12, RT-21, LT-31, LT-32, RM-Z04 правлены; D207 и далее записаны
- [ ] `node discussion/tools/lint-ids.mjs` и `plan-check` без ошибок; файлы `docs/design` — LF
- [ ] `npm run verify` зелёный
