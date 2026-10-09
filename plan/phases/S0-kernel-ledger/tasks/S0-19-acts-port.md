---
id: S0-19
title: Порт acts — адаптеры local, init, fixture, recorded
phase: S0
stage: G
size: M
modules: [adapters, ledger]
depends: [S0-16]
rules: [TR-14, TR-15, TR-16]
---

# S0-19 · Порт acts — адаптеры local, init, fixture, recorded

## Зачем

Act — единственный путь человеческого решения в LATTICE (TR-14). S0 доказывает landing с `local` acts: без forge, подписанным git-коммитом или тегом.

## Объём

Входит:
- **интерфейс** порта: прочитать acts change request — глагол, цель (hash proposal или intents по `id` и hash тела), идентичность, `uri` источника, время источника, результат проверки подписи;
- **`acts-local`** (TR-14): git-коммит или тег, подписанный SSH, с трейлером `Lattice-Act: <verb> <target>`, текст ответа — в сообщении; проверка — `git verify-commit` / `git verify-tag` с allowed signers, собранным из ключей writers policy (Q-04); GPG — по требованию;
- **`acts-init`**: acts store init (LG-47);
- **`acts-fixture`**: acts из тестовых данных;
- **`acts-recorded`** (TR-16): acts, уже записанные в коммит как `act`-события, — для повторного landing, открытия store и fold, которые никогда не зовут forge;
- **одна проверка** (TR-16): landing читает acts через порт один раз и записывает каждый как событие `act` с `uri`, временем источника и результатом проверки;
- act засчитывается только для proposal, чей hash он называет (TR-15).

Не входит: `github`, `gitlab` и команда `act` для `runtime` — S1 по SL-Z04.

## Тесты и фикстуры

- Контракт-сюита порта на всех четырёх адаптерах (ST-07).
- `local`: подписанный разрешённым ключом коммит — act; подпись чужим ключом, неподписанный коммит, трейлер с другим hash — не act, с причиной.
- Тесты `local` создают временный git-репозиторий с тестовым SSH-ключом; на windows CI — тоже (R5).

## Готово, когда

- [x] контракт-сюита зелёная на `local`, `init`, `fixture`, `recorded`
- [x] `local` проверяет подпись по ключам из policy, а не по ключам машины
- [x] act-события, записанные landing, читаются через `recorded` и дают те же решения

## Риски и заметки

- Время источника у `local` — время коммита, которое задаёт автор; дизайн это допускает: срок сертификата проверяется по нему (TR-11).
- От S0-03 (Q-13, Q-20): `acts-fixture` уже есть — acts из тестовых данных по change request, без разрешающего умолчания (Q-20); его подключает только тестовая сборка `test/support/assembly.ts`, импорт из `src/` тест структуры отклоняет (ST-07).
- Сделано (G-55): тесты `local` — `test/contract/acts-local.test.ts` на временном репозитории `test/support/signed-git.ts` с dev-ключами `test/keys/` (`dev-owner` — ключ policy, `dev-land` — чужой); «записаны landing и читаются через `recorded`» — `test/contract/acts-recorded.test.ts` на `fixture` и `local`. Решение «засчитан ли act» — `coversProposal` (TR-15, TR-16) с фикстурами `test/fixtures/TR-15/`, `TR-16/`; его вызывает фаза 5 (S0-17). TR-14 — граница ревью и тесты адаптеров: жёсткой проверки с этим rule ID нет.
