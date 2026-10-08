---
id: S0-18
title: Фаза 6 — эволюция типов и контрактов, identity, migrate
phase: S0
stage: F
size: L
modules: [ledger, cli]
depends: [S0-13, S0-14, S0-07]
rules: [RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-19, RF-22, TY-08, TY-14, TR-44, RT-32]
---

# S0-18 · Фаза 6 — эволюция типов и контрактов, identity, migrate

## Зачем

Типы и контракты меняются, не ломая то, что их пинит (RF-Z01). Фаза 6 читает и `before`, и `after`: сравнивает новую ревизию с предыдущей.

## Объём

Входит — фаза 6 apply:
- **ревизия типа** (RF-13): `compare` с предыдущей; `same`/`wider` — блоки остаются; иначе каждый блок в use валидируется под новой ревизией, невалидный обязан получить новую ревизию в том же коммите;
- **новая запись** — по latest ревизии типа; существующий блок переходит на новую ревизию типа только новой своей ревизией; более строгий тип не мешает вывести из use (RF-14);
- **классы контракта** (RF-15): `same-shape`, `consumer-compatible`, `breaking` — по `compare` input, params, output, статусов, `uses`, операций порта; `breaking` как ревизия того же `id` — отказ (RF-16, RF-17); breaking — новый `id` с `supersedes` (RF-18, TY-08);
- **пины контракта** (RF-19): новый пин — на current revision; ветка «ревизия, которую пинит `live` pipeline» — S1;
- **закрытость status facts** (TY-14, G-32): тип, чей `extends` называет status fact, — отказ TY-14;
- **identity** (RF-12): новый блок перечисляет в `supersedes` pinned последние ревизии заменяемых; старый получает `retired`; преемники читаются из referrers;
- **живучесть policy** (TR-44): после коммита policy проектного namespace держит ключ владельца и ключ участника `land`;
- **impact** (RF-22): замыкание referrers изменённой цели по меткам команды;
- **`lattice migrate`** (RT-32): черновик intents новых ревизий блоков, невалидных под новой ревизией типа.

Не входит: live closure guard (S1), `rebind` (S3), `upgrade` (SW).

## Тесты и фикстуры

Фикстуры trigger/pass: RF-13 (сужение типа без миграции блоков; с миграцией в том же коммите), RF-16/RF-17 (breaking ревизия), RF-19, TR-44 (policy без ключа `land`), TY-14 (тип, чей `extends` называет `retired` или `alias`). Таблица классов RF-15 по парам контрактов.

## Готово, когда

- [ ] фаза 6 подключена в реестр фаз
- [ ] `lattice migrate` на сужении типа даёт proposal, который проходит apply
- [ ] impact — одна функция, готовая для `rebind` и `upgrade`

## Риски и заметки

- Если сверх L — делить на «типы и `migrate`» и «контракты и пины».
- От S0-07: `compare(a, b, mode, resolve)` возвращает `{relation, aspects}`, `aspects` — список имён `validity`, `ref`, `edge`, `unique`, `key`, `card_order`, `description` в этом порядке (G-27); `same-shape` RF-15 — каждый аспект из `card_order`, `description`.
- От S0-08: схема `fact` не выражает закрытость status facts (TY-14); отказ — эта фаза по `after` (G-32). Что у неотозванного `alias` есть `value` (TR-29), проверяет фаза 4 (S0-15).
