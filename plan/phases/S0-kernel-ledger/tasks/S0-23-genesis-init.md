---
id: S0-23
title: Genesis, store init и команда init
phase: S0
stage: G
size: M
modules: [ledger, adapters, assembly, cli]
depends: [S0-20, S0-19, S0-22]
rules: [LG-47, LG-18, LG-50, TY-01, SL-04, KR-03, RT-32]
---

# S0-23 · Genesis, store init и команда init

## Зачем

Каждый ledger начинается с трёх коммитов store init (LG-47). Hash genesis — константа версии ядра. До переключения версия ядра `0`, и любой store одноразовый (SL-04).

## Объём

Входит:
- **genesis** (LG-47): мета-тип и тип сессии, записанные кодом ledger в genesis-сессии с `at` `1970-01-01T00:00:00.000000Z` и `id` сессии — константой версии ядра; genesis-сессия — она же land session; `sig` и `proposal_sig` — `null`; hash genesis — константа (KR-03);
- **commit 2**: namespace проекта с владельцем и pins из конфигурации init (TR-01, LG-44);
- **commit 3**: `setup@1` без bindings (RT-10);
- все три — через landing (S0-20) с acts адаптера `init`;
- **исключения** LG-18 — по rule ID в реестре apply: самотипизированный мета-тип, тип сессии вместе с первой сессией, namespace в создаваемом им namespace, init-сессии без reason, `sig`/`proposal_sig` `null` в genesis;
- **init ledger `std`**: commit 2 несёт namespace `std` вместе с типом этой записи и всеми типами, достижимыми от него по `extends` и `$ref` (LG-18, LG-47);
- **пути** (LG-50): `store/knowledge.jsonl`, `store/proposals/`, `store/evidence/`, `store/lattice.json` — конфигурация init и расположение store и пакетов библиотек; `.gitignore` для `gen/` и `.lattice/`;
- **`lattice init`** (RT-32) и схема `store/lattice.json` в `assembly`.

## Тесты и фикстуры

- Hash genesis — константа, закреплённая в тесте; два init на разных машинах дают одинаковый genesis.
- Каждое исключение LG-18 срабатывает только в своём случае: тот же приём вне init отклоняется.
- E2E: `lattice init` во временном git-репозитории → три коммита в `store/knowledge.jsonl` → `lattice verify-store` зелёный.

## Готово, когда

- [ ] `lattice init` создаёт store с тремя коммитами, прошедшими landing
- [ ] hash genesis постоянен и закреплён
- [ ] фикстуры LG-18 и LG-47 — trigger и pass

## Риски и заметки

- Задача на четыре модуля — триггер аудита ST-15.
