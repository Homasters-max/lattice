---
id: S0-10
title: Proposal и commit — форматы, hash, подписи, цепочка
phase: S0
stage: E
size: M
modules: [ledger, trust]
depends: [S0-04, S0-05]
rules: [LG-04, LG-05, LG-06, LG-09, LG-10, LG-54]
---

# S0-10 · Proposal и commit — форматы, hash, подписи, цепочка

## Зачем

Proposal — единственная форма изменения знания (PR-02), commit — единица порядка `knowledge`. Их байты, hash и подписи — общий язык apply, store, landing и кодека.

## Объём

Входит:
- **proposal** (LG-09): `{session, intents, sig}`; intent `{op, id, type, expected, at, body}`; все `id` событий и `at` — от автора; apply назначает только `seq`, `rev`, `hash`;
- **hash proposal** (LG-10): канонические байты без `sig`, intents в каноническом порядке; `sig` — Ed25519 ключом сессии;
- **commit** (LG-06): заголовок `{seq, prev, kernel, base, proposal, proposal_sig, by, at, request, sig}` и записи в каноническом порядке (G-03); hash коммита — канонические байты без `sig`; `sig` — Ed25519 ключом land session;
- **цепочка** (LG-04, LG-05): `seq` плотный с 1, `prev` — hash предыдущего, `at` не убывает (LG-06); функция проверки цепочки и подписей для открытия store;
- **подписи** — `node:crypto` (D-06), запись подписи и ключа — G-10; функции чистые: ключ приходит параметром, чтение ключей из файлов — в `cli`;
- **один proposal на change request** (LG-54): proposal без intents — допустимый формат.

Не входит: проверка сертификатов и прав (S0-16, S0-17), apply (S0-13), команда `draft` (S0-21).

## Интерфейс

```ts
// src/trust/signature.ts — G-10, G-24
signHash(hash, key: SessionKey): string                 // ed25519:<base64url> над UTF-8 текста hash
verifyHash(hash, sig, key: PublicKey): boolean          // ключ — строка OpenSSH ssh-ed25519
publicKeyOf(key: SessionKey): PublicKey

// src/ledger/proposal.ts
readProposal(value, path?): Result<Proposal>            // LG-09, форма закрыта
canonicalIntents(intents, keyOf: KeyOf): Intent[]       // LG-06, G-03; keyOf — ключ факта по аннотации key, NO_FACTS до S0-13
proposalHash(p, keyOf): string                          // LG-10
signProposal(p, sessionKey, keyOf): Proposal
verifyProposal(p, key, keyOf, path?): Rejection[]       // LG-10

// src/ledger/commit.ts
commitHash(c): string                                   // LG-06, без sig
chainTo(candidate, tail): Commit                        // LG-05, G-14: prev — hash tail
signCommit(c, landKey): Commit                          // LG-06
verifyChain(commits, keyOfSession, path): Rejection[]   // LG-04, LG-05, LG-06
```

## Тесты и фикстуры

- Перестановка intents не меняет hash proposal (LG-11 опирается на это).
- Изменённый байт записи, разрыв `prev`, дыра в `seq`, убывающий `at`, чужая подпись — каждая ломает `verifyChain` с rule ID.
- Фикстуры trigger/pass: LG-04, LG-05, LG-06, LG-10. Проверка `chain` в `test/fixtures/checks.ts` строит цепочку через apply, `chainTo` и `signCommit` (`test/support/chain.ts`); trigger портит готовый коммит по JSON Pointer и подписывает снова — сырой вход trigger (Q-23). Проверка `signature` подписывает proposal тестовым ключом `signedBy` и проверяет ключом `session`.
- Ключи тестов выводятся из имени (`test/support/keys.ts`); формат подписи и ключа сверен с RFC 8032 §7.1, тест 1.

## Готово, когда

- [x] hash proposal и commit детерминированы и не зависят от порядка входа
- [x] `verifyChain` ловит каждое нарушение из списка выше с rule ID
- [x] фикстуры LG-04, LG-05, LG-06, LG-10 — trigger и pass
- [x] G-03 и G-10 записаны в `CONVENTIONS.md`

## Риски и заметки

- Ed25519 детерминирован: одинаковые ключ и данные дают одинаковую подпись — на этом стоит воспроизводимая сборка `std` (S0-24).
- От S0-03 (Q-10): `readProposal` в `src/ledger/proposal.ts` проверяет форму поверхностно — поля и их виды JSON, отказ LG-09 с фикстурами `test/fixtures/LG-09/`; задача доводит форму до LG-09 полностью. Канонический порядок `canonicalIntents` сейчас — сущности, затем события, по `id`; группа фактов по ключу (G-03) — здесь. Коммит в store — каноническая строка: `encodeCommit` и `decodeCommit` в `src/ledger/commit.ts`; `readCommit` уже проверяет форму коммита поверхностно — поля заголовка и их виды JSON, отказ LG-06 с фикстурами `test/fixtures/LG-06/` (ревью S0-03, волна 2); задача доводит LG-06 до цепочки и подписей.
- Сделано иначе, чем в наброске: `canonicalOrder(records, keyOf)` стал `canonicalIntents(intents, keyOf)` — records коммита идут в порядке intents, из которых apply их строит, и тот же порядок нужен hash proposal (LG-10); поэтому `proposalHash` и `signProposal` тоже берут `keyOf`. `verifyChain` возвращает отказы (`Rejection[]`, `CONVENTIONS.md` §2), а не `Violation[]`, и берёт `path` — место строк store (Q-29). Добавлены `signCommit`, `chainTo` (бывший `onTail` landing) и проверка LG-10 `verifyProposal` — без неё у LG-10 нет жёсткой проверки для фикстур.
- Закрытый ключ сессии — `SessionKey`, ключ платформы (`KeyObject`): формат файла ключа выбирает `cli` (S0-16, S0-21), чистый код его не читает. Подписываемые байты — UTF-8 текста hash: пробел G-24.
- `verifyChain` не проверяет `proposal_sig`: ключ сессии proposal даёт её сертификат, это цепочка TR-12 в apply (S0-16). Порядок records внутри коммита он тоже не сверяет — для фактов нужны типы; records покрыты подписью коммита.
- Форма LG-09 закрыта: лишние поля proposal и intent (`by`, `rev`, `seq`, `hash`) отклоняются; `sig` — строка или `null` по форме, подпись ли это — LG-10.
