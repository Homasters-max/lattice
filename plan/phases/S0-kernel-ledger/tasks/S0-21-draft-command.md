---
id: S0-21
title: Команда draft
phase: S0
stage: G
size: S
modules: [cli, ledger]
depends: [S0-10, S0-16]
rules: [RT-32, LG-09, LG-54]
---

# S0-21 · Команда draft

## Зачем

`draft` пишет intents в proposal (RT-Z03) — это путь автора к знанию. Он нужен для приёмки (SL-01) и условие переключения: SL-03 (5).

## Объём

Входит:
- `lattice draft` добавляет intents в proposal текущей ветки: entity — `id`, `type@n`, тело из JSON-файла; `expected` вычисляется как latest revision на tail (LG-09); event — `id` от порта `ids`, `at` от порта `clock`;
- один proposal на change request (LG-54): `store/proposals/<slug ветки>.json` (G-08); proposal без intents допустим;
- подпись ключом текущей сессии (`lattice session`, S0-16);
- `draft` никогда не читает `md` (RT-Z03).

Не входит: проверка — это `land --dry-run`.

## Тесты и фикстуры

- Две команды `draft` в одной ветке дают один proposal с двумя intents; hash не зависит от порядка.
- `draft` на сущность, которая изменилась на tail после предыдущего `draft`, обновляет `expected`.

## Готово, когда

- [ ] `lattice draft` → `lattice land --dry-run` → `lattice land` проходит во временном репозитории
- [ ] G-08 записан в `CONVENTIONS.md`

## Риски и заметки

- От S0-16: текущая сессия — `.lattice/session.json` (событие `{id, at, body}`, G-47; оно же `session` proposal) и `.lattice/session.key` (PKCS #8 PEM); подпись — `signProposal` этим ключом.
