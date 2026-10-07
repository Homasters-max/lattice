---
id: S0-27
title: Codec — export blocks в md и команда export
phase: S0
stage: H
size: M
modules: [codec, cli]
depends: [S0-25, S0-12, S0-38]
rules: [LG-42, RM-07, RM-06, RT-32]
---

# S0-27 · Codec — export blocks в md и команда export

## Зачем

Вторая половина round-trip: блоки из read view обратно в те же байты. После переключения `docs/` — только экспорт (RM-06, LG-43), и эта функция станет единственным автором `docs/`.

## Объём

Входит:
- **`export(view) → documents`**: от секций уровня 1 через `items` к блокам; `clause` — строка таблицы, `cells` по колонкам, заголовок таблицы — из `items` секции; `prose` — абзац; `example` — fenced-блок; поля `table` и `list` — сразу после блока;
- вывод — через `print` из S0-25, поэтому канонический по построению;
- **`lattice export --docs <каталог>`** (RT-32) пишет `md` из tail; `--gen` — в S0-28;
- **заголовок сгенерированных файлов** (OB-10) в S0 не пишется — G-09.

Не входит: запись `docs/` при landing (SW), сравнение `docs/` в CI (SW, LG-51 (2)).

## Тесты и фикстуры

- `export(view(import(x)))` побайтно равен `x` для каждого файла `docs/design` — на `memory` store (после S0-24 — с настоящим `std`, в S0-29).
- Блок, который никакая секция не держит, в export не теряется молча: отказ с причиной (orphan как finding — S1, но export не может его вывести).

## Готово, когда

- [ ] round-trip через блоки побайтно зелёный на всём `docs/design`
- [ ] `lattice export --docs` пишет каталог, равный `docs/design`
- [ ] модуль `codec` импортирует только `kernel` и `ledger` (ST-01)
