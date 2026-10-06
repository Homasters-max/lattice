---
id: S0-24
title: Ledger std — воспроизводимая сборка и загрузка в проект
phase: S0
stage: G
size: M
modules: [ledger, assembly]
depends: [S0-23, S0-08, S0-17, S0-18]
rules: [TY-01, TY-02, LG-44, LG-48]
---

# S0-24 · Ledger std — воспроизводимая сборка и загрузка в проект

## Зачем

`std` — свой ledger в пакете LATTICE (TY-01), его hash — константа версии (LG-48). Без настоящего `std` нет ни `lattice init` проекта, ни импорта `docs/design`.

## Объём

Входит:
- **сборка** `scripts/build-std`: исходники `std/source/` (S0-08) → init ledger `std` (Q-03) → proposal с типами → landing с act владельца; детерминированно: `clock-fixed`, `ids-counter`, dev-ключ ядра `0` (Q-04);
- **артефакт** `std/knowledge.jsonl` в пакете и константа его hash в коде;
- **CI**: сборка повторяется и побайтно совпадает с закоммиченным файлом; константа совпадает (LG-48);
- **проект**: `lattice init` пинит `std` текущей версии LATTICE; read view проекта видит типы `std` (S0-22);
- типы, которые читает LATTICE, меняются только с версией LATTICE (TY-02): правка `std/source/` без пересборки валит CI.

Не входит: `upgrade std@1 → @2` (SW, LG-46), черновики из S0-09.

## Готово, когда

- [ ] `scripts/build-std` воспроизводим, CI сверяет байты и hash
- [ ] `lattice init` проекта видит `std/namespace`, `std/setup`, `std/clause` и остальные типы S0
- [ ] фикстура LG-48: подменённый `std/knowledge.jsonl` отклоняется при загрузке

## Риски и заметки

- На SW `std` пересобирается под ядром `1` с настоящими ключами; файл и константа меняются один раз.
