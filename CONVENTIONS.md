# Соглашения кода

Как пишется код LATTICE. Правила — в `docs/design`; этот документ выбирает форму там, где правило её не задаёт, и ссылается на правило там, где задаёт. Расхождение с правилом решается в пользу правила (`AGENTS.md`). Соглашение, принятое по ходу задачи, дописывается сюда в её ветке.

## 1. Данные

- **Записи — замороженные простые данные и чистые функции** (ST-03). Нет класса на тип записи, нет методов на данных, нет прототипов кроме `Object` и `Array`. Объект записи — то, что даёт `JSON.parse` строгого парсера, плюс `Object.freeze`.
- **Типы `readonly`**: поля `readonly`, массивы `readonly T[]`, словари `{ readonly [key: string]: V }`. Функция не мутирует вход; новое значение — новый объект.
- **Данные — `type`, поведение — `interface`.** Запись, intent, proposal, commit, строка, отказ и строка реестра правил — псевдонимы `type`: так они присваиваются `JsonValue` и идут в `canon` и `hash` без приведения. Порт, read view, команда — `interface`.
- **`Record` — запись** (KR-04, ST-03; решение владельца Q-15): так называется тип записи в `kernel`. Утилита TypeScript `Record<K, V>` в коде не используется — словарь пишется индексной сигнатурой (пункт «Типы `readonly`»).
- **Заморозка проверяется в тестах**: на границе модуля тест передаёт вход через `deepFreeze` (хелпер `test/support/deep-freeze.ts`) — функция, которая мутирует вход, падает в тесте. В рабочем коде глубокая заморозка не обязательна: её гарантирует строгий парсер ядра и `readonly`.
- **Классы** — только там, где у сущности есть изменяемое состояние внешнего мира: адаптер может быть замыканием или классом. Порт — `interface`, адаптер — фабрика `createX(options)` от своих настроек, которая возвращает объект этого интерфейса (решение владельца Q-22).
- **Адаптер** живёт в `src/adapters/<port>-<variant>/` (`store-memory`, `clock-fixed`): имя начинается с порта, который он реализует, — по нему тест структуры знает, какой интерфейс адаптеру можно импортировать (ST-01).
- **Адаптеры для тестов** — каждый `*-fixture` (TR-14, LG-23), `clock-fixed` и `ids-counter` (ST-07) — собирает только тестовая сборка `test/support/assembly.ts`; ни один файл `src/`, `assembly` тоже, их не импортирует — это проверяет тест структуры (решение владельца Q-13, `plan/closure-check.md`, «acts и права»).
- **Аргументы порта** (решение владельца по ревью S0-03): операция порта с несколькими аргументами принимает один объект с именами аргументов из правила — у всех портов, без порога: `prepare({request, onto})`, `push({worktree, ref, expected, message, trailers})` (LG-23), `append({commit, delta, evidence})` (LG-02). Операция с одним аргументом берёт его как есть.
- **Адаптер store не знает canon** (решения владельца по ревью S0-03, Q-09, Q-19): ledger отдаёт в `append` коммит его канонической строкой. Из `commits` и `tail` store отдаёт байты каждой строки, как их хранит, пустую тоже; ledger сам декодирует их (KR-10) и разбирает. Адаптер ничего не декодирует, не разбирает и не выбрасывает, а строкам delta смысла не придаёт (LG-35). Порядок ключей строк — `sortRows`, который порт `store` отдаёт вместе с контрактом (Q-18).
- **Имена — термины LATTICE** из `docs/design/00-glossary.md` (ST-03): `record`, `entity`, `event`, `intent`, `proposal`, `commit`, `apply`, `fold`, `delta`, `row`, `view`, `standing`, `session`, `act`, `store`, `landing`… Слово, которого нет в глоссарии, не становится именем понятия LATTICE: локальная переменная или функция — можно, тип или экспорт с новым смыслом — нет; новый термин входит в дизайн правкой глоссария (GL-Z01).
- **Аналогии не термины** (ST-Z02): в коде нет `event sourcing`, `aggregate`, `repository`, `middleware`, `plugin`, `manager`, `service` как имён понятий.

## 2. Результаты

- **Нарушение правила — значение, не исключение.** Жёсткая проверка возвращает

  ```ts
  type Result<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly rejections: readonly [Rejection, ...Rejection[]] };
  ```

  Список отказов не пуст. Значение успеха — то, что задаёт правило: apply — `commit` или `no-op` (LG-14), landing — свой исход (LG-25).
- **Исключение — только ошибка программы**: нарушенный инвариант, который вход не мог нарушить, если код верен. Сообщение начинается с `bug:`. Сбой внешнего мира в адаптере (диск, сеть, процесс `git`) — тоже исключение: это не нарушение правила. Вход, который правило отклоняет, никогда не приходит исключением и никогда не исправляется молча (KR-10, LG-42).
- **Нарушения `validate`** (KR-21) — свой тип, не отказ: `{ path, keyword, expected, got }`. Результат `validate` — `{ ok: true } | { ok: false, violations }`. Фаза 2 apply переводит каждое нарушение в отказ с rule ID, который нарушение показывает, и путём `/body` + `path` нарушения.
- **Чистые модули синхронны.** `Promise` появляется только на порту; функция, которая ждёт порт (landing, открытие store), асинхронна, всё, что она зовёт между портами, — нет (решение владельца Q-17: landing чист по ST-04 и достаёт git, acts, store, время и id только через порты LG-23).

## 3. Отказ

Формат отказа — LG-17:

```ts
// src/kernel/rejection.ts
type RulePrefix = "PR" | "KR" | "TY" | "RF" | "LG" | "TR" | "RT" | "DP" | "LN" | "BN" | "OB" | "AG" | "ST" | "SL" | "RM" | "GL";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type RuleId = `${RulePrefix}-${Digit}${Digit}`;           // ID строки таблицы правил; Z-блоки отказом не называются

type Lang = "en";                                         // растёт вместе с шаблонами (раздел 6)

type Rule = {                                             // строка реестра правил модуля
  readonly id: RuleId;
  readonly message: { readonly en: string } & { readonly [lang in Lang]?: string };
};

type Rejection = {
  readonly intent: string | null;                         // `id`, записанный в intent; null — отказ не про intent
  readonly rule: RuleId;
  readonly message: string;
  readonly path: string;                                  // JSON Pointer (RFC 6901)
  readonly expected: JsonValue;
  readonly got: JsonValue;
  readonly id?: string;                                   // дубликат: id, с которым столкнулся (LG-17)
};

type Rejections = readonly [Rejection, ...Rejection[]];
type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly rejections: Rejections };

function reject(rule: Rule, place: Omit<Rejection, "rule" | "message">): Rejection;  // place, не at: at — время (Q-22)
function sortRejections(rejections: readonly Rejection[]): Rejection[];   // порядок раздела 5
function refuse<T>(first: Rejection, ...rest: readonly Rejection[]): Result<T>;  // отказ, отсортированный
function refused<T>(rejections: readonly Rejection[]): Result<T> | null;  // null — отказывать не в чем
```

- **`intent` и `path`** (G-13). `intent` — значение `id`, записанное в intent, как есть, даже если оно неверно; так отказ не зависит от порядка intents (LG-11). `path` — JSON Pointer внутри этого intent: `/body/title`, `/expected`. Если у intent нет строкового `id` или отказ не про intent (подпись proposal, сессия, открытие store, загрузка библиотеки), `intent` — `null`, а `path` указывает от корня проверяемого входа: `/intents/3/id`, `/sig`. Корень целиком — `""`.
- **`expected` и `got`** — JSON-значения: что правило ждало и что пришло. Описание вместо значения допустимо, когда значения нет: `expected: "a ULID"`, `got: "absent"` у поля, которого нет. У байтов JSON-значения нет — отказ называет их hash `sha256:…` (Q-19). Значение секрета туда не попадает (раздел 6).
- **Отказ создаётся только `reject`** из ядра; `rule` и `message` берутся из строки реестра. Литерал `"KR-06"` вне реестра — нарушение соглашения.
- **Реестр правил модуля** — файл `src/<module>/rules.ts` (у адаптера — `src/adapters/<adapter>/rules.ts`): плоский список констант, по одной на rule ID, который применяют жёсткие проверки модуля, и массив `RULES` из них. Не фреймворк (ST-02): ни классов, ни регистрации во время выполнения, ни поиска по строке.

  ```ts
  // src/kernel/rules.ts — пример
  import type { Rule } from "./rejection.js";

  export const KR_06 = {
    id: "KR-06",
    message: { en: "an entity id is namespace/slug and an event id is a ULID; got {got}" },
  } as const satisfies Rule;

  export const RULES: readonly Rule[] = [KR_06];
  ```

  Имя константы — rule ID с `_` вместо `-`. Один rule ID может стоять в реестрах двух модулей, если правило велит проверять в двух местах (LG-20: landing и recording); повтор той же проверки в другом модуле — обход (`plan/closure-check.md`).
- **Исключения genesis и store init** (LG-18) тоже называются rule ID — константами реестра `ledger` в отдельном списке `EXEMPTIONS`, не в `RULES`: исключение ничего не отклоняет, фикстур ST-17 у него нет; показывают его тесты init.

## 4. Жёсткие проверки и фикстуры

**Жёсткая проверка** (ST-17) — код, который отклоняет вход потому, что правило не выполнено. Она объявляет rule IDs, которые применяет: импортирует их константы из реестра своего модуля и отклоняет только с ними. Правило без жёсткой проверки в реестр не входит.

**Раскладка фикстур:**

```text
test/fixtures/
├── coverage.ts  coverage.test.ts   fitness-тест покрытия (ниже)
├── run.ts  run.test.ts             прогон каждой фикстуры через её проверку
├── checks.ts                       таблица жёстких проверок для фикстур
├── load.ts                         чтение реестров, фикстур и дизайна с диска
└── KR-06/                          одна папка на rule ID
    ├── trigger/
    │   └── entity-id-uppercase.json   <case>.json — имя говорит, что сломано
    └── pass/
        └── entity-id.json
```

**Формат фикстуры:**

```jsonc
// test/fixtures/KR-06/trigger/entity-id-uppercase.json
{
  "check": "apply",                                   // ключ строки в test/fixtures/checks.ts
  "input": { "proposal": { … } },                     // вход в той форме, которую ждёт строка checks.ts
  "expect": { "rule": "KR-06", "path": "/id", "intent": "Demo/Hello" }  // rule — ID папки; intent — по желанию
}

// test/fixtures/KR-06/pass/entity-id.json
{ "check": "apply", "input": { "proposal": { … } } }   // без expect
```

- Trigger проходит, когда проверка отклоняет вход и среди отказов есть отказ с `rule` и `path` из `expect` (и `intent`, если он указан). Другие отказы рядом допустимы, но фикстура строится так, чтобы ломать одно.
- Pass проходит, когда проверка принимает вход целиком (`ok: true`). Pass — минимальный верный вход, а не «вход без этого нарушения».
- Строка `checks.ts` — `{ enforces, run }`: `enforces` — rule IDs проверки из реестра, `run` превращает `input` фикстуры в вызов проверки. Вход готовится только публичными функциями модулей: предыдущее состояние store — список proposals, проведённых через apply по очереди; commit, собранный руками в обход apply, — обход (`plan/closure-check.md`, «запись знания»).
- Вход — JSON. Текстовый вход (`md` для `import-md`, LG-42) — JSON-строка: она хранит байты точно, включая `\r` и отсутствие `\n` в конце.

**Fitness-тесты** (ST-12) в `test/fixtures/` держат это соглашение:

- `coverage.test.ts` — у каждого rule ID из `RULES` всех реестров `src/**/rules.ts` есть `trigger/` и `pass/` хотя бы с одним `.json`; каждая папка — rule ID, который определён в `docs/design` и объявлен реестром; каждый файл — разбираемый JSON.
- `run.test.ts` — каждая фикстура называет проверку из `checks.ts`, эта проверка применяет rule ID папки, trigger отклоняется с ожидаемым rule ID и путём, pass принимается.

## 5. Порядок

Порядок всего, что видит человек или что пишется в байты, — детерминированный и не зависит от порядка входа, окружения и обхода `Map`.

- **Нарушения `validate`** (KR-21): по `path`, затем по `keyword`, затем по каноническому JSON `expected`, затем `got`.
- **Отказы apply и других жёстких проверок**: по `intent` (`null` первым), затем по `path`, затем по `rule`, затем по `id`, затем по каноническому JSON `expected`, затем `got`. Внутри фазы apply собирает все отказы и сортирует их один раз на выходе фазы (LG-16).
- **Сравнение строк — по кодовым единицам UTF-16** (`a < b`), как сортирует ключи canon (RFC 8785). `localeCompare` и `Intl` запрещены: они зависят от локали.
- Порядок `Map`, `Set` и `Object.keys` — порядок вставки; там, где он доходит до байтов или вывода, явная сортировка обязательна (риск R6 плана S0).

## 6. Сообщения

- **Сообщение — из шаблона по rule ID** (TR-40): шаблон — строка `message` в строке реестра. `reject` подставляет поля отказа в плейсхолдеры `{intent}`, `{path}`, `{expected}`, `{got}`, `{id}`; значение выводится как канонический JSON. Сообщение не собирается конкатенацией в коде проверки.
- **Язык — параметр вывода**: `reject` пишет `message` на `en`; `cli` по запросу читателя перерисовывает сообщение на его язык функцией `render(rule, rejection, lang)` из того же шаблона, при отсутствии шаблона языка — `en`. Таблицу правил всех модулей для `cli` собирает `assembly` из их `RULES`. В S0 шаблоны только `en`.
- **Сообщение — текст для читателя и в систему не возвращается** (TR-40): ни один код не разбирает `message`; агент читает `rule`, `path`, `expected`, `got` (AG-04).
- **Секрет не повторяется** (LG-20): значение секрета видит только проверка секретов; её отказ — `got: null`, а `path` указывает, где секрет. Ни один шаблон не выводит значение, прочитанное через `$env`.

## 7. Change units

Одна задача — одна change unit — одна ветка — один PR (PR-15); независимость частей (PR-16), что не идёт параллельно (PR-17), интеграция пересборкой на новом `main` (PR-18), не больше трёх задач в работе (SL-06) — процесс описан в навыке [`plan-task`](.claude/skills/plan-task/SKILL.md) и здесь не повторяется.

## 8. Чистота

Вне `adapters`, `assembly`, `cli` код чистый (ST-04, KR-02): время, id и внешний мир приходят только через порты `clock`, `ids`, `store`, `git`, `acts` (LG-23). Тест структуры (`test/structure/audit-purity.ts`) запрещает в чистых модулях; имя, объявленное в самом файле, — не глобальное и не запрещено:

| Что | Запрещено | Разрешено |
|---|---|---|
| модули платформы | любой `node:*`, кроме ниже | `node:crypto`: только `createHash`, `verify`, `sign`, `createPublicKey`, `createPrivateKey` |
| процесс и окружение | `process`, `import.meta` целиком, `globalThis`, `global`, `require`, `module`, `exports`, `__dirname`, `__filename`, `Buffer`, `navigator` | `TextEncoder`, `TextDecoder` |
| время | `Date.now`, `new Date()` без аргумента, `Date()` как функция, `performance`, методы `Date` в локальном времени (`getHours`, `getTimezoneOffset`, `toString`, …) | `new Date(x)` с аргументом, `Date.UTC`, `getUTC*`, `toISOString` |
| случайность | `Math.random`, глобальный `crypto` целиком (`randomUUID`, `getRandomValues`), `randomBytes` из `node:crypto` | — |
| сеть | `fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource` | — |
| планировщик | `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask` | — |
| локаль | `Intl`, `localeCompare`, `toLocaleString`, `toLocaleDateString`, `toLocaleUpperCase`, `toLocaleLowerCase` | `toUpperCase`, `toLowerCase` |
| исполнение кода | `eval`, `Function`, динамический `import()` | — |
| недетерминизм GC | `WeakRef`, `FinalizationRegistry` | — |
| вывод | `console` | — |

- **Нет изменяемого состояния на уровне модуля** в чистом коде: `let`, мутируемые `Map`, `Set`, массивы вне функций (кандидат в fitness-тест, `plan/closure-check.md`).
- **JSON** в `kernel`, `trust`, `ledger` — только через строгий парсер и canon ядра; `JSON.parse` и `JSON.stringify` вне них — нарушение (KR-10). JSON разбирает одна функция — `parseJson` в `src/kernel/parse.ts`; до строгого парсера S0-04 она ещё пропускает то, что KR-10 отклоняет (G-16). Адаптеры JSON ledger не разбирают вовсе (раздел 1).
- Тесты (`test/`) и dev-скрипты (`scripts/`) — не чистый код: им можно `node:fs`, время и случайность, но рабочий код они вызывают так же, как `assembly`.

## 9. Файлы и стиль

- **ESM**, импорт с суффиксом `.js` (`nodenext`), только именованные экспорты, без `default`. Файлы — `kebab-case.ts`. Точка входа модуля — `src/<module>/index.ts`; соседние модули импортируют только её и названные входы `test/structure/modules.ts` — интерфейс порта `src/ledger/ports/<port>.ts`, read view `src/ledger/view.ts`. Импорт другого файла чужого модуля тест структуры отклоняет (ST-01).
- **Импорты** — по матрице ST-01 (`AGENTS.md`); матрица как данные — `test/structure/modules.ts`, тест сверяет её с таблицей ST-01 дизайна. Список файлов, достижимых из ядра, — `test/structure/kernel-files.txt` (ST-05): новый файл ядра дописывается туда в той же задаче. Файлы, которыми владеет skeleton (ST-15), — `test/structure/skeleton-files.txt`.
- **Команды** (RT-32): таблица — `src/cli/commands.ts`, текст — из RT-Z03; команда без обработчика названа в `src/cli/stubs.ts` с задачей, где появится. Задача, которая реализует команду, убирает её строку из `stubs.ts` и добавляет обработчик в `src/cli/run.ts`; таблицу не трогает. Код выхода: `0` — сделано, `1` — отклонено (отказы, `moved`, `conflict`), `2` — не запущено (использование, неизвестная команда, заглушка, нет store).
- **Идентификаторы, комментарии, строки сообщений** — на английском (PR-14). Комментарий объясняет, почему, и называет rule ID, если код его исполняет.
- **Профиль качества** до SW — `eslint.config.js` (Q-08): сложность 10, функция 50 строк, вложенность 3, параметров 4, файл 300 строк. Сгенерированное (`gen/`) руками не правится (ST-08).
- **Тесты** лежат в `test/`, раскладка повторяет `src/`: `test/<module>/…test.ts`; свойства fast-check — там же, рядом с тестами модуля. Название теста, который показывает правило, начинается с его ID: `it("KR-06: refuses …")`. Порты — контракт-тестами в `test/contract/` на всех адаптерах (ST-07).
