---
id: S0-13
title: Apply — каркас, кандидат, before/after, фазы 1–3
phase: S0
stage: F
size: L
modules: [ledger]
depends: [S0-12, S0-06, S0-07, S0-36]
rules: [LG-11, LG-12, LG-13, LG-14, LG-15, LG-16, LG-17, LG-18, PR-02, GL-05]
---

# S0-13 · Apply — каркас, кандидат, before/after, фазы 1–3

## Зачем

Apply — единственный путь в `knowledge` (PR-02, LG-14). Каркас фаз задаёт, куда фазы 4–6 (S0-15, S0-17, S0-18) подключаются параллельно, не трогая друг друга.

## Объём

Входит:
- **`apply(before, proposal, acts, evidence) → commit | no-op | rejections`** (LG-14): чистая функция; `acts` — land session и сформированные act-события; время и id коммита приходят от landing; `prev`, `request` и `sig` кандидата — `null`, их дописывает landing (G-14);
- **кандидат** (LG-15): после фазы 1 — назначить `seq`, `rev` (следующий после latest), `hash`; `after = before ⊕ fold(before, candidate, evidence)` без записи;
- **фазы** (LG-16): реестр фаз с видом (`before` / `after` / оба); внутри фазы собираются все отказы, стоп после первой отказавшей; фазы 4–6 — пустые места, которые заполнят свои задачи; **фаза 7 в S0** — по Q-05;
- **фаза 1 Record**: заголовок, канонические байты, форматы (KR-04…KR-13, функции S0-04, S0-05);
- **фаза 2 Schema** (`after`): тела типов и `extends` (S0-07), тело по `type@n` (S0-06), `rev` ⇔ entity по `kind` (KR-04, KR-05), записи abstract типа нет (KR-16), тип сущности не меняется для `id` (KR-07); тип и его блоки в одном коммите (LG-11);
- **фаза 3 Commit** (`before`): `expected` равен latest (LG-11), одна intent на `id` и на ключ факта, `at` не убывает (LG-06), события не меняются;
- **no-op** (LG-12, LG-13): proposal с уже известным hash — тот же commit (поиск — G-04); тело равно latest и latest в силе — no-op; ревизия не в силе подтверждается новой ревизией с тем же телом и act; пустой commit не пишется;
- **исключения genesis и init** (LG-18): именованы rule ID в реестре apply, никогда не выводятся из ключа;
- **форма отказа** (LG-17) из S0-02;
- **исход apply несёт hash proposal** (разбор волны 2) — и для commit, и для no-op: landing берёт trailer `Lattice-Proposal` из исхода и не пересчитывает hash сам; ключ факта (`KeyOf`) apply выводит из типов `before` внутри себя, а не получает от вызывающего.

Не входит: фазы 4–6, полный in force (S0-14 — до неё «в силе» = latest).

## Тесты и фикстуры

- Любой порядок intents даёт тот же итог и те же байты (LG-11).
- Фаза, которая отказывает, останавливает следующие; внутри фазы — все отказы сразу.
- Для каждой допущенной фикстуры `after` apply равен `view(seq)` store после записи (LG-39).
- Фикстуры trigger/pass: LG-11 (устаревший `expected`, две intents на один `id`), LG-12, LG-13, LG-06 (`at` назад), KR-07 (смена типа), KR-16, KR-21 в фазе 2.

## Готово, когда

- [ ] apply чистый: проходит тест структуры, без портов
- [ ] фазы 1–3 с фикстурами; фазы 4–6 подключаются регистрацией, без правки каркаса
- [ ] фаза 7 ведёт себя по решению Q-05, с фикстурой
- [ ] свойство «`after` = `view(seq)`» зелёное

## Риски и заметки

- G-04: если владелец выберет вопрос read view вместо поиска в landing — это правка LG-38, а не локальное решение.
- G-14 (принята, Q-12): фазе 3 (`at` не убывает, LG-06) нужен `at` tail-коммита из `before`, а закрытый список LG-38 его не даёт. Кандидат на правку LG-38 — tail-заголовок (`seq`, hash, `at`) в read view; тогда и `prev` переходит из landing в apply. Решает владелец до кода фазы 3.
- От S0-03 (ревью, волна 3): `apply` уже возвращает `Result<Commit | "no-op">`, и proposal без intents — `no-op` (LG-12, LG-54); landing садит его без коммита знания (LG-25). Задача добавляет no-op отдельных intents (LG-13) и повтор hash proposal (LG-12, G-04).
- От S0-04: фаза 1 уже проверяет канонический вид proposal (KR-10: session и sig от корня, каждый intent внутри себя) и лимит тела (KR-13) — `phaseRecord` в `src/ledger/apply.ts`, фикстуры `KR-10/trigger/apply-body-not-nfc`, `KR-13/`. После фазы 1 `known` в `src/ledger/commit.ts` раскрывает canon и hash без отказа.
- От S0-05: функции заголовка в ядре — `checkHeader(value, place)` (с S0-37 — `Result<Record>`; KR-04 ровно поля, KR-06 `id` по виду, который заявляет `rev`, KR-07 `type@n` через `parseRef`, KR-08 `by` — ULID, KR-11 `at`) и `checkRev(kind, rev, place)` (KR-04, KR-05) для фазы 2. Фаза 1 пока проверяет у intent только `id` (KR-06): `type` floating или `at` не в каноне apply пропустит, а открытие store следующим landing эту запись отклонит — фаза 1 закрывает это проверкой `type`, `at` и `by` (id сессии) каждой intent.
- От S0-06: тело по схеме — `checkBody(body, schema, resolve, {intent, path: "/body"})` ядра: отказ KR-21 на каждое нарушение `validate`, `expected` — `{keyword: …}` (CONVENTIONS §2). `resolve` даёт схему abstract типа по `$ref` из `after` (LG-11: тип может прийти в том же коммите); схема — та, что прошла `checkSchema` в теле типа (S0-07), с учётом цепочки `extends`. Фикстуры KR-21 через `checkBody` уже есть (`test/fixtures/KR-21/`); фикстура этой задачи — KR-21 в фазе 2 через apply.
- От S0-10: канонический порядок intents и records (G-03) и hash proposal берут `KeyOf` — ключ факта по аннотации `key` его типа (KR-19, TR-28); apply (`candidate`) и landing (trailer `Lattice-Proposal`) пока передают `NO_FACTS`. Задача заменяет его функцией по типам из `before` в обоих местах. Форма proposal (LG-09) закрыта: лишнее поле proposal или intent — отказ; `expected` — число или `null`, что это последняя ревизия, проверяет фаза 3 (LG-11).
- От архитектурного разбора, волна 2 (2026-10-07): фаза 2 одной записи — один вход ядра из S0-36 с одним резолвером тел типов из `after`; заметки от S0-05 (`checkRev`), S0-06 (`checkBody`, `resolve` схем) и S0-07 (`checkType`, `checkRecordType`) ниже описывают состояние до S0-36 — эти функции внутренние, недопущенный тип в цепочке — отказ KR-15 (Q-33). Закрытая форма заголовков и тел — функция ядра из S0-35; результат проверок — `Result` (S0-37). Hash proposal сейчас считается дважды и независимо — `proposalHash(proposal, NO_FACTS)` в `apply.ts:37` и в `landing.ts:146`: задача заменяет `NO_FACTS` в одном месте — внутри apply, а landing берёт hash из исхода, так что trailer и `commit.proposal` совпадают по построению.
- От S0-36: фаза 2 одной записи — `checkAgainstType({type, rev, body}, resolve, {intent, path})` ядра: `rev` по виду типа (KR-04), запись abstract типа (KR-16), тело типа `core/type@1` с цепочкой `extends` (KR-14, KR-15) или тело против схемы своего типа (KR-21); пути — `/rev`, `/type`, `/body/…` от `place.path`. `resolve` — тела типов по pinned ссылке из `after`; мета-тип ядро берёт из `META_TYPE` само. Неизвестный или недопущенный тип записи — KR-15 на `/type` (Q-33, G-28). Заметки от S0-05, S0-06 и S0-07 ниже — состояние до S0-36.
- От S0-07: тело записи типа `core/type@1` проверяет `checkType(body, resolve, {intent, path: "/body"})`, а не `checkBody`: подмножество не описывает схему (G-26). `resolve` — `ResolveType`: тело типа по pinned ссылке из `after`. Запись abstract типа отклоняет `checkRecordType(typeBody, {intent, path: "/type"})` (KR-16). Схема ребёнка по `extends` полная — тело проверяется схемой своего типа без слияния с предками (G-26). Мета-тип в `after` до genesis (S0-23) берётся из `META_TYPE` ядра.
