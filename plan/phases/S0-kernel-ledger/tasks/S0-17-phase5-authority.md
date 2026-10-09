---
id: S0-17
title: Фаза 5 — полномочия, acts, floor и act requirements
phase: S0
stage: F
size: M
modules: [ledger, trust]
depends: [S0-13, S0-14, S0-16]
rules: [TR-04, TR-08, TR-14, TR-15, TR-17, TR-42, PR-19]
---

# S0-17 · Фаза 5 — полномочия, acts, floor и act requirements

## Зачем

Кто может написать этот тип и чей act нужен — проверяет фаза 5 над `before` (LG-16, TR-06), так что коммит никогда не выдаёт права сам себе.

## Объём

Входит — фаза 5 apply:
- **сертификат и подпись** proposal (TR-11, TR-12 — функции S0-16);
- **роль** (TR-08, PR-19): роль сессии может писать тип intent; право на тип покрывает подтипы;
- **writers** (TR-09, TR-10): act засчитывается только от идентичности writer, перечисленного по имени;
- **acts** (TR-14, TR-15): глаголы `approve`, `answer`, `acknowledge`; `approve` называет hash proposal или intents по `id` и hash тела и не покрывает intent с другим телом;
- **floor** (TR-04): act владельца на каждый status fact, кроме `verdict`; на смену policy или владельца; на upgrade; на каждую ревизию типа, включая первую; act владельца проектного namespace на новый namespace;
- **act requirements** (TR-42): строки `acts` — `match` (типы с подтипами, status facts, `policy`, `upgrade`, `namespace`), `from`, `count`; act участника сессии proposal не засчитывается при `count > 1`; `match` по операции порта — S1;
- **передача владения** (TR-17): два act в одном proposal; `recovery` — `count` участников вместо старого владельца;
- недостающий обязательный act — отказ apply; в dry-run он же попадает в `awaiting-act` (S0-20).

## Тесты и фикстуры

Фикстуры trigger/pass на каждое правило списка; отдельно — каждая строка floor, требование с `count: 2`, где один из act — автора proposal, и передача владения через `recovery`.

## Готово, когда

- [ ] фаза 5 подключена в реестр фаз
- [ ] каждая строка floor и act requirements покрыта фикстурами
- [ ] отказ «нет act» отличим от прочих, чтобы landing перевёл его в `awaiting-act`

## Риски и заметки

- Delegation (TR-18) — S3: поле policy читается, но ничего не меняет.
- От S0-16: цепочка TR-12 — `verifySession({session, types, policy, at}, place, (key) => verifyProposal(p, key, keyOf, place))` из `src/trust`: `session` — `proposal.session` на `/session`, `types` — resolver типов фазы 2: тело сессии проверяет схема `core/session@1` из genesis (KR-21), `policy` — `policyOf(before, namespace)` (TR-06) того namespace, куда пишет intent, `at` — время источника первого засчитанного act или `at` коммита (TR-11). Отказы — TR-10, TR-11, TR-12 и LG-10, фикстуры — строка `session` в `test/fixtures/checks.ts`. Сессия `agent` проходит цепочку только с сертификатом caller (S3): до тех пор её отклоняет TR-12 — у `agent` в policy нет ключей (TR-10). Запись `<name>/namespace` не типа `std/namespace-policy@1` `policyOf` не считает namespace (G-47): отклонить её при записи (TR-01) — здесь.
- От S0-16: owner — human-участник (GL-07), но `readPolicy` и `ownerOf` его вида не проверяют (G-48): owner act (TR-17) и act floor (TR-04) засчитываются только от идентичности записи `writers` с участником `owner` и видом `human` (TR-09) — фикстура trigger на owner, чья запись writers не `human` или которого в `writers` нет.
