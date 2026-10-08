---
name: dev-loop
description: Довести задачу плана или PR LATTICE до решения владельца о merge — исполнитель, ревью нужных осей, исправления; итоги в PR.
disable-model-invocation: true
argument-hint: "[S0-NN | PR <n>]"
---

# Цикл разработки

Эта сессия — **оркестратор**: ведёт цикл по выводу `dl` и выходам агентов. Механику — режим и оси круга, id, решения по кругу, комментарии — делает `dl`. Контракт агентов — `plan/dev-loop.md`. Владелец нужен только через эскалацию и для merge. Один цикл — одна свежая сессия, параллельно до трёх (SL-06).

- **Папка цикла** `<папка>` — `D:/tmp/lattice/dev-loop/<ID>/`, `<ID>` — ID задачи или `pr-<n>`. `<work>` — `<папка>/work`, worktree ветки, где работают все агенты. Рабочую копию владельца трогает только `start` — переводит на свежий `main`, когда это ничего не теряет.
- **`dl <команда>`** — `node <work>/plan/tools/dev-loop.mjs <команда> --dir <папка>`. Печатает одну строку JSON.
- **Агент** — `Agent` с `subagent_type` из вывода `dl` и промптом ровно `DEV-LOOP-IN <brief>`. Отвечает строкой `DEV-LOOP-OUT <out>`. На `errors` от `dl` — `SendMessage` тому же агенту `DEV-LOOP-ERRORS <errors JSON>` и та же команда `dl` снова.
- **Пост** — `gh pr comment <n> --body-file <comment>` для каждого `comment` из вывода `dl`, сразу.
- **Контекст оркестратора** — только строки `dl`, `DEV-LOOP-OUT`, коды выхода и файл `questions`. Diff, код, brief, out, отчёты и лог verify не читай.

## Переходы

Каждый вывод `dl` с полем `next` ведёт сюда.

| `next` | Действие |
|---|---|
| `review` | все `agents` одним сообщением, затем `dl merge` |
| `merge` | `dl merge` |
| `fix` | `dl brief fixer --worktree <work> --job answer` → новый агент `fixer` → `dl answer` → пост → «Ворота». `status: needs_owner` — эскалация с `--why "вопрос исправляющего" --from <out>` |
| `tidy` | `dl brief fixer --worktree <work> --job tidy` → новый агент `fixer` → `dl answer --job tidy` → пост → «Ворота» |
| `gate` | «Ворота» |
| `instruct` | `dl brief fixer --worktree <work> --job owner` → новый агент `fixer` → `dl check <out>` → «Ворота» |
| `resume` | ответ владельца агенту `agent`: живому — `SendMessage` `DEV-LOOP-OWNER <ответ>`; если его нет — новый по `dl brief executor --task <ID> --worktree <work>` или `dl brief fixer --worktree <work> --job <job>` (ответ brief берёт из состояния) |
| `done`, `final` | «Сдать» |
| `escalate`, `owner` | «Эскалация» с `--why` из вывода |
| `ask` | «Эскалация», п. 3, с `questions` из вывода |
| `executor` | «Исполнитель» |
| `stop` | цикл окончен; PR остаётся draft с `blocked` |
| `end` | PR открыт и `git merge-base --is-ancestor origin/main HEAD` ложно — «Сдать» заново; иначе сообщи владельцу, что цикл завершён |

## Начать или продолжить

Аргумент `S0-NN` — `--task S0-NN`; `PR <n>` или `#<n>` — `--pr <n>`. Без аргумента — первая из «готовы к старту» по `node plan/tools/plan-check.mjs`; скажи владельцу одной строкой, какую задачу берёшь.

`node plan/tools/dev-loop.mjs start --task <ID> | --pr <n>` из рабочей копии — одна команда. Она переводит рабочую копию на свежий `main`, если копия чистая и стоит на `main` или на ветке со смерженным PR; находит открытый PR задачи, создаёт или проверяет worktree, ставит зависимости, восстанавливает состояние из комментариев и печатает `dir` (`<папка>`), `work` (`<work>`) и `next`.

- `copy.synced: false` — копия не обновлена: скажи владельцу одной строкой `copy.why` и на сколько коммитов (`copy.behind`) она отстаёт от `main`; цикл идёт дальше.
- `next: executor` — «Исполнитель».
- `interrupted: true` — прошлый агент оборвался: повтори его поручение — агент по `brief` (роль в нём), если `brief` есть, иначе по `next`.
- Иначе — по `next` из «Переходов».

Уборка: worktree циклов, чьи PR закрыты, — `git worktree remove <папка>/work`.

## Исполнитель

`dl brief executor --task <ID> --worktree <work>` → агент `executor` → `dl check <out>`.

- `ready` — `dl init --task <ID> --from <out>` → «Ворота».
- `needs_owner` с `pr` — `dl init --task <ID> --from <out>`, затем «Эскалация» с `--why "вопрос исполнителя" --from <out>`. Без `pr` (PR ещё не открыт) — `AskUserQuestion` из `question` в выводе `dl check`, ответ агенту `DEV-LOOP-OWNER <ответ>`.

## Ворота

В `<work>`: `git fetch origin`, `git checkout --detach origin/<ветка>`; HEAD равен `headRefOid` PR. `npm run verify > <папка>/verify.log 2>&1`.

- Зелёный — `dl wave --worktree <work>`, дальше по `next`.
- Красный — `dl brief fixer --worktree <work> --job verify-red --log <папка>/verify.log` → агент `fixer` → `dl check <out>` → «Ворота». Круг на это не тратится; третий красный подряд — «Эскалация» с `--why "verify красный трижды"`.

Ветка, от которой ушёл `main`, до «Сдать» не пересобирается: ревью считает diff от merge-base, а пересборка посреди цикла делает следующий круг полным. Исключение — текстовый конфликт с `main` (`gh pr view <n> --json mergeStateStatus` — `DIRTY`): `dl brief fixer --worktree <work> --job rebase` → агент `fixer` → `dl check <out>` → «Ворота».

## Сдать

- `git merge-base --is-ancestor origin/main HEAD` ложно — `dl brief fixer --worktree <work> --job rebase` → агент `fixer` → `dl check <out>` → verify. `conflicts` задевают `src/` или `test/` — `dl wave --worktree <work> --conflicts <файлы через запятую>`, дальше по `next`. Иначе — к следующему пункту.
- `dl final --worktree <work>` → пост. `gh pr ready <n>`; метка `blocked` на PR есть (`gh pr view <n> --json labels`) — `gh pr edit <n> --remove-label blocked`.
- Владельцу: задача, число кругов, ссылка на PR; что отложено в план и куда, что отклонено, что решить до merge — по разделам итога, без пересказа. Merge делает владелец. Защита ветки `main` пускает merge, только когда PR стоит на tail `main` и CI зелёный; ушёл `main` после «Сдать» — «Update branch» с rebase в PR, а при конфликте — `/dev-loop PR <n>`.

## Эскалация

1. `dl escalate --why "<причина>" [--from <out агента с question>]` → пост.
2. `gh pr ready <n> --undo`, `gh pr edit <n> --add-label blocked`.
3. `AskUserQuestion` с вопросами из файла `questions`. Ответ может прийти и комментарием владельца в PR.
4. Ответ на находки (вопросы с `header` = id находки) — файл `<папка>/answers.json` вида `{"W1-T1": {"action": "...", "note": "..."}}`.
   - Варианты: `чинить` → `fix`, `снять` → `drop`, `в задачу` → `task`, `стоп` → `stop`.
   - Свой текст с `G-NN` → `gap`, иной свой текст → `fix` с этим текстом в `note`.
   - Затем `dl owner --answers <папка>/answers.json` → пост, дальше по `next`.
5. Ответ на прочие вопросы — `dl owner --text "<ответ>"` → пост, дальше по `next`.
