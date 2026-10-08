// task: механические шаги задачи плана (S0-51) — шаг 1 и шаг 6 `plan-task`, которые делает `dl`.
// Файл задачи — `plan/phases/<фаза>/tasks/<ID>-<slug>.md`: название во frontmatter, пункты «Готово, когда» — `- [ ] …`.
// Доска фазы — таблица с колонками «Задача», «Статус», «PR»; фазы — таблица `plan/STATUS.md` с колонками «Фаза», «Статус», «Начата».
// Функции над текстом чистые; findTask читает каталог плана.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const lf = (text) => text.replace(/\r\n/g, "\n");
const ITEM = /^- \[([ xX])\] (.+)$/;
const DONE_SECTION = /^## Готово, когда\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const CLOSED = ["✅", "✖"];
export const PHASE_STARTED = "🔄 в работе";
export const PHASE_ACCEPTANCE = "🔍 приёмка";

/** Файл задачи `id` в `root`: `{path, board, phase, branch, title, text}` или null; path и board — от корня, через `/`. */
export function findTask(root, id) {
  const phases = join(root, "plan", "phases");
  for (const dir of existsSync(phases) ? readdirSync(phases) : []) {
    const tasks = join(phases, dir, "tasks");
    const file = existsSync(tasks) ? readdirSync(tasks).find((f) => f.startsWith(`${id}-`) && f.endsWith(".md")) : undefined;
    if (file === undefined) continue;
    const text = lf(readFileSync(join(tasks, file), "utf8"));
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    const field = (name) => new RegExp(`^${name}:\\s*(.+)$`, "m").exec(front)?.[1]?.trim() ?? null;
    return {
      path: `plan/phases/${dir}/tasks/${file}`,
      board: `plan/phases/${dir}/STATUS.md`,
      phase: field("phase"),
      branch: file.replace(/\.md$/, "").toLowerCase(),
      title: field("title"),
      text,
    };
  }
  return null;
}

/** Пункты «Готово, когда»: `[{text, checked}]`. */
export function itemsOf(text) {
  const section = DONE_SECTION.exec(lf(text))?.[1] ?? "";
  return section.split("\n").map((l) => ITEM.exec(l)).filter(Boolean).map((m) => ({ text: m[2].trim(), checked: m[1] !== " " }));
}

/** Текст задачи, где пункты «Готово, когда» из done отмечены `[x]`; остальные строки не меняются. */
export function markItems(text, done) {
  const names = new Set(done.map((d) => d.trim()));
  const source = lf(text);
  const m = DONE_SECTION.exec(source);
  if (!m) return source;
  const start = m.index + m[0].length - m[1].length;
  const section = m[1].split("\n").map((l) => {
    const item = ITEM.exec(l);
    return item && names.has(item[2].trim()) ? `- [x] ${item[2]}` : l;
  });
  return source.slice(0, start) + section.join("\n") + source.slice(start + m[1].length);
}

// Ячейки строки таблицы; `|` внутри кода — не граница.
function cells(line) {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "";
  let code = false;
  for (const ch of s) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const row = (values) => `|${values.map((v) => (v === "" ? " " : ` ${v} `)).join("|")}|`;

// Таблица, чей заголовок начинается ячейкой first: {header, rows: [{at, cells}]} — at, номер строки в lines.
function tableOf(lines, first) {
  const start = lines.findIndex((l) => l.startsWith("|") && cells(l)[0] === first);
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith("|"); i++) rows.push({ at: i, cells: cells(lines[i]) });
  return { header: cells(lines[start]), rows };
}

const column = (table, name) => table.header.indexOf(name);

/** Доска фазы, где задача id — ✅ со ссылкой link: `{text, last}` (last — на доске не осталось несданных) или `{error}`. */
export function closeOnBoard(text, id, link) {
  const lines = lf(text).split("\n");
  const table = tableOf(lines, "Задача");
  const [status, pr] = table ? [column(table, "Статус"), column(table, "PR")] : [-1, -1];
  if (status < 0 || pr < 0) return { error: "на доске нет таблицы с колонками «Задача», «Статус», «PR»" };
  const found = table.rows.find((r) => r.cells[0].startsWith(`[${id}]`) || r.cells[0] === id);
  if (!found) return { error: `задачи ${id} нет на доске` };
  found.cells[status] = "✅";
  found.cells[pr] = link;
  lines[found.at] = row(found.cells);
  const last = table.rows.every((r) => CLOSED.some((s) => r.cells[status].startsWith(s)));
  return { text: lines.join("\n"), last };
}

/** `plan/STATUS.md`, где фаза code в работе (с датой начала, если её не было) или, если last, на приёмке: `{text}` или `{error}`. */
export function advancePhase(text, code, { last, date }) {
  const lines = lf(text).split("\n");
  const table = tableOf(lines, "Фаза");
  const [status, started] = table ? [column(table, "Статус"), column(table, "Начата")] : [-1, -1];
  if (status < 0 || started < 0) return { error: "в plan/STATUS.md нет таблицы фаз с колонками «Статус» и «Начата»" };
  const found = table.rows.find((r) => r.cells[0] === code);
  if (!found) return { error: `фазы ${code} нет в plan/STATUS.md` };
  const before = row(found.cells);
  const target = last ? PHASE_ACCEPTANCE : PHASE_STARTED;
  if (!found.cells[status].startsWith(target.split(" ")[0])) found.cells[status] = target;
  if (["", "—"].includes(found.cells[started])) found.cells[started] = date;
  // Строка, где ничего не изменилось, остаётся побайтно прежней.
  if (row(found.cells) !== before) lines[found.at] = row(found.cells);
  return { text: lines.join("\n") };
}
