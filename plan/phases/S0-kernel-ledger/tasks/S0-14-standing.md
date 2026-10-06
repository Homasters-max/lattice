---
id: S0-14
title: Standing — basis, in force, use, факты
phase: S0
stage: F
size: M
modules: [trust, ledger]
depends: [S0-12, S0-08]
rules: [TR-19, TR-20, TR-22, TR-23, TR-24, TR-25, TR-26, TR-27, TR-28, TR-29, TR-31]
---

# S0-14 · Standing — basis, in force, use, факты

## Зачем

Доверие вычисляется, а не назначается (TR-Z01). Что в силе, что в use и на каком основании — от этого зависят no-op (LG-13), уникальность (LG-19), эволюция типов (RF-13) и вывод `solve` в S1.

## Объём

Входит — чистые правила `trust`, строки которых пишет fold (TR-25):
- **basis** (TR-19, TR-20): таблица без строк run-derived (S1) и делегирования (S3): без act — `inferred`; `human`/`agent` + act — `asserted`; `machine` с purpose `check`/`bench` + act — `observed`; `machine` с `init`/`work`/`import` + act — `derived`; act на intent агента — `asserted` (TR-24);
- **in force** (TR-22, TR-23): basis допустим для базового типа (у `hint` — любой), acts по требованиям policy до коммита есть, запись — последняя по `seq` для ключа или `id`; current revision и latest revision различаются;
- **use** (TR-26): `in-use`, `retired`, `alias` с каноническим `id`, `not-in-force`;
- **standing** (TR-25): `{inForce, basis, use, live}`, `live` в S0 всегда `null`;
- **факты** (TR-28, TR-29, TR-31): ключ из аннотаций `key`; текущее значение — последний факт в силе; отмена — `revoked: true`, не `value: false`; `retired`, `alias` (звезда, не цепочка — проверка в S0-15); факт с текущим значением — no-op;
- finding «overridden» (TR-30) — S1 по SL-Z04; ledger и так хранит прежние значения.

## Тесты и фикстуры

TR-27: таблица basis и предикат in force — чистые функции, тест на каждую строку таблиц; use на фикстурах `retired`, `alias`, отменённого `retired` и ревизии без act; `standing` через read view на `memory`.

## Готово, когда

- [ ] таблица basis и in force покрыты тестом построчно
- [ ] `view.standing(ref)` отвечает по строкам fold
- [ ] no-op из S0-13 использует настоящий in force

## Риски и заметки

- Требования acts для in force читаются из policy в `before` коммита записи (TR-06): позднее изменение policy не меняет, была ли запись в силе.
