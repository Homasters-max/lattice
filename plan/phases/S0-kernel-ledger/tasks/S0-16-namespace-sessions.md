---
id: S0-16
title: Namespace, policy, участники, сессии, сертификаты и команда session
phase: S0
stage: F
size: M
modules: [trust, ledger, assembly, cli]
depends: [S0-10, S0-08]
rules: [TR-01, TR-02, TR-05, TR-06, TR-07, TR-09, TR-10, TR-11, TR-12, GL-07, RT-32]
---

# S0-16 · Namespace, policy, участники, сессии, сертификаты и команда session

## Зачем

`by` каждой записи — сессия с сертификатом (TR-11). Без сессий нельзя подписать proposal, а без policy — решить, кто что пишет. S0 доказывает сессии с сертификатом, подписанным собственным ключом человека или машины.

## Объём

Входит:
- **namespace и policy** (TR-01, TR-02, TR-05): чтение полей `owner`, `writers`, `roles`, `pins`, `acts`, `recovery`, `delegation` (поле есть, смысл — S3), `labels`, `budget` (S1), `quality`; владелец сущности — владелец её namespace;
- **policy из `before`** (TR-06): функция «policy, действующая для коммита» над read view;
- **участники и writers** (TR-07, TR-09, TR-10): виды `human`, `agent`, `machine`; идентичности `github:`, `gitlab:`, `ssh:`; ключи Ed25519 в формате OpenSSH — свой разбор строки `ssh-ed25519 …` (R5);
- **сессия** (TR-11): событие `core/session` — participant, kind, role, purpose, `for`, `parent`, software и version, сертификат `{public key, expiry, signature}`, подписанный ключом участника;
- **проверка цепочки** (TR-12): ключ из policy → сертификат → подпись proposal; срок — по времени первого засчитанного act или по `at` коммита; просроченный или чужой сертификат — отказ;
- **`lattice session`** (RT-32): создать сессию, выпустить сертификат ключом участника (Q-04), сохранить ключ сессии в `.lattice/`; `id` и время сессии — от портов `ids` и `clock` через `assembly` (`Assembly.session`), как `land`.

Не входит: сессии агентов с сертификатом caller и ключи ролей caller (S3), проверка в фазе 5 (S0-17), живучесть policy TR-44 (S0-18).

## Тесты и фикстуры

- Сертификат, подписанный ключом не из policy; просроченный; подпись proposal не тем ключом — отказы с rule ID.
- Изменение policy действует со следующего коммита (TR-06).
- Фикстуры trigger/pass: TR-10, TR-11, TR-12; ещё TR-09 — у чтения policy свои отказы, и LG-10 через строку `session` — последнее звено цепочки. Форму policy и тела сессии держит схема их типа (KR-21), не trust: у TR-02 своей жёсткой проверки нет.

## Готово, когда

- [x] `lattice session` выпускает сессию и сертификат dev-ключом и ключом из OpenSSH-файла
- [x] проверка цепочки ключ → сертификат → proposal — чистая функция в `trust`
- [x] фикстуры TR-10, TR-11, TR-12 — trigger и pass

## Риски и заметки

- Подпись — по Q-04: под ядром `0` dev-ключи из `test/keys/`; человек подписывает сертификат сырой Ed25519-подписью ключом из незашифрованного OpenSSH-файла.
- Задача на четыре модуля — триггер аудита ST-15.
- От S0-10: подписи и ключи — `src/trust/signature.ts` (`signHash`, `verifyHash`, `publicKeyOf`; запись — G-10, подписываемые байты — G-24, `CONVENTIONS.md` §1); `signProposal` и проверка LG-10 `verifyProposal(p, key, keyOf, place)` (с S0-37 — `Result<Proposal>`) — в `src/ledger/proposal.ts`, фикстуры `test/fixtures/LG-10/`. Задача берёт ключ из сертификата сессии (TR-11, TR-12) и отдаёт его `verifyProposal`; `sig: null` форма LG-09 пропускает — его отклоняет LG-10. Ключи тестов, выведенные из имени, — `test/support/keys.ts`; dev-ключи `test/keys/` (Q-04) — этой задачи и S0-24.

## Как сделано

- `src/trust/policy.ts`: `readPolicy` читает тело namespace, которое допустил его тип `std/namespace-policy@1` (KR-21), и отклоняет только то, чего схема не говорит: идентичности writers (TR-09), ключи Ed25519 OpenSSH и ни одного ключа у `agent` (TR-10); `namespaceOf`, `policyOf(before, namespace)` (TR-06; запись другого типа на id namespace — не namespace, G-47), `ownerOf(before, id)` (TR-05, GL-07).
- `src/trust/session.ts`: `readSession(value, types, place)` — событие сессии `{id, at, body}` (TR-11, G-45), `id` — ULID (KR-06), `at` — время (KR-11), тело — схемой `core/session@1`, которую даёт `types` (KR-21), и причина `for`, которой требует purpose: у `work`, `import`, `check`, `bench` она есть, у `init` её нет (OB-01); `signSession` и `issueSession` подписывают сертификат ключом участника по hash события без `sig` (G-46); `verifySession({session, types, policy, at}, place, proposal)` — цепочка TR-12: срок (TR-11), подпись сертификата ключом участника из policy (TR-12), вид и роль его записи writers (TR-10), затем последнее звено — `proposal(sessionKey)`: ledger отдаёт в него `verifyProposal` (LG-10), так hash proposal остаётся ledger.
- `src/trust/signature.ts`: `isPublicKey` и `readOpenSshKey` — свой разбор незашифрованного OpenSSH-файла ключа (Q-04, R5), его ключ — `ParticipantKey`, не `SessionKey`; dev-ключи — `test/keys/dev-owner` (human) и `test/keys/dev-land` (machine), помечены INSECURE.
- `lattice session`: `src/cli/session.ts` читает файл ключа (`--key` или путь из `.lattice/participant-key`, Q-04) и пишет `.lattice/session.json`, `.lattice/session.key` (PKCS #8 PEM), `.lattice/participant-key`; сессию выпускает `startSession` в `src/assembly/session.ts` с портами `clock` и `ids`. Bin до S0-23 отвечает «no store is configured», как `land`.

## Отступления

- Проверка в apply не подключена: фаза 5 Authority (LG-16) — объём S0-17, который зовёт `verifySession` с policy namespace из `before` и временем по TR-11 (заметка «От S0-16» в S0-17).
- GL-07 — частично: `ownerOf` даёт участника, которого policy называет `owner`, а что он `human`, здесь не проверяется — ни одно правило не требует, чтобы owner был записью `writers`, и не называет отказ (G-48); human-владельца держит act владельца в фазе 5 (S0-17, заметка «От S0-16» там).
- Модуль `assembly`: команде нужны `clock` и `ids`, а `cli` импортирует только `assembly` (ST-01); рабочие адаптеры `clock-system` и `ids-ulid` приходят со сборкой из `store/lattice.json` (S0-23, заметка там).
