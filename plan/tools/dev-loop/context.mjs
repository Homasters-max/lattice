// context: материал агента цикла (S0-48) — brief каждой роли в бюджете и материал шага `dl step`.
// У каждого текста один дом: правило — docs/design, пункт — CONVENTIONS.md, раздел процесса — plan-task,
// опись замыкания — plan/closure-check.md, строки Q-NN и G-NN — PLAN.md фазы; context берёт их дословно.
// Brief — данные задачи не больше BUDGET токенов по оценке tokens(); что не вошло, brief называет в cut и говорит,
// где это взять. Файлы читаются из worktree агента, diff — git в нём.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { conventionsOf } from "./conventions.mjs";
import { classOf, ST_BY_CLASS } from "../../../scripts/paths.mjs";
import { scope } from "./scope.mjs";
import { findTask } from "./task.mjs";

const BUDGET = 15000;
// Под cut и поля протокола: материал занимает бюджет без них.
const RESERVE = 2000;
const CUT_LISTED = 40;
const PLAN_TASK = ".claude/skills/plan-task/SKILL.md";
const CLOSURE = "plan/closure-check.md";
// Разделы plan-task, которые агент берёт шагом `dl step <имя>`; печатаются как есть.
export const STEPS = { pr: "Шаблон описания PR", deviation: "Отступления от задачи", where: "Что и куда пишет исполнитель" };

const lf = (text) => text.replace(/\r\n/g, "\n");
const pretty = (value) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
/** Оценка токенов текста или значения в brief: байт UTF-8 на 4 — латиница около 4 знаков на токен, кириллица около 2. */
const tokens = (value) => Math.ceil(Buffer.byteLength(pretty(value), "utf8") / 4);
const readText = (root, path) => (existsSync(join(root, path)) ? lf(readFileSync(join(root, path), "utf8")) : "");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const listOf = (front, name) => (new RegExp(`^${name}:\\s*\\[([^\\]]*)\\]`, "m").exec(front)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// --- тексты из их домов ---

/** Раздел markdown с заголовком `## heading` до следующего `## ` вне блока кода — как написан. */
function section(text, heading) {
  const lines = lf(text).split("\n");
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return null;
  let end = start + 1;
  for (let fence = false; end < lines.length; end++) {
    if (lines[end].startsWith("```")) fence = !fence;
    if (!fence && lines[end].startsWith("## ")) break;
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

/** Текст правила id в документе: строка таблицы `| ID | … |` или абзац `ID. …`. Правило, которое кончается двоеточием,
 * вводит следующий блок — таблицу или абзац после пустой строки (ST-01, RM-Z04), — и он часть правила. */
function ruleIn(text, id) {
  const lines = lf(text).split("\n");
  const at = lines.findIndex((l) => l.startsWith(`| ${id} |`) || l.startsWith(`${id}. `));
  if (at < 0) return null;
  const out = [lines[at]];
  let i = at + 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (/:\s*\|?\s*$/.test(lines[at]) && i > at + 1) while (i < lines.length && lines[i].trim() !== "") out.push(lines[i++]);
  return out.join("\n");
}

/** Тексты правил по ID из docs/design: `[{id, text}]`; правила, которого там нет, — text null. */
function rulesOf(root, ids) {
  const dir = join(root, "docs", "design");
  const docs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => lf(readFileSync(join(dir, f), "utf8"))) : [];
  return [...new Set(ids)].map((id) => ({ id, text: docs.map((d) => ruleIn(d, id)).find((t) => t !== null) ?? null }));
}

/** Строки таблиц PLAN.md фазы с этими ID — вопросы Q-NN и пробелы G-NN: `[{id, text}]`. */
function planRows(plan, ids) {
  const lines = lf(plan).split("\n");
  return [...new Set(ids)].map((id) => ({ id, text: lines.find((l) => l.startsWith(`| ${id} |`)) ?? null })).filter((r) => r.text !== null);
}

/** Путь под glob области пункта: `**` — любые каталоги, `*` — часть имени. */
const matchesGlob = (glob, path) => posix.matchesGlob(path, glob);
// Область задевает модуль, если её пути и `src/<module>/`, `test/<module>/` пересекаются по префиксу до первой `*`.
const touchesModule = (glob, module) => {
  const literal = glob.split("*")[0];
  return [`src/${module}/`, `test/${module}/`].some((dir) => dir.startsWith(literal) || literal.startsWith(dir));
};
const item = ({ id, title, areas, text }) => ({ id, title, areas, text });

/** Пункты CONVENTIONS.md, чья область задевает пути: `[{id, title, areas, text, paths}]`. */
function conventionsForPaths(root, paths) {
  return conventionsOf(readText(root, "CONVENTIONS.md")).items
    .map((i) => ({ ...item(i), paths: paths.filter((p) => i.areas.some((a) => matchesGlob(a, p))) }))
    .filter((i) => i.paths.length);
}

/** Пункты CONVENTIONS.md, чья область задевает модули задачи. */
function conventionsForModules(root, modules) {
  return conventionsOf(readText(root, "CONVENTIONS.md")).items.filter((i) => i.areas.some((a) => modules.some((m) => touchesModule(a, m)))).map(item);
}

/** Задача из её файла: путь, текст, модули, правила, ID вопросов и пробелов, PLAN.md фазы. */
function taskOf(root, id) {
  const found = id ? findTask(root, id) : null;
  if (!found) return null;
  const front = /^---\n([\s\S]*?)\n---\n/.exec(found.text)?.[1] ?? "";
  const plan = found.board.replace(/STATUS\.md$/, "PLAN.md");
  return { path: found.path, text: found.text, modules: listOf(front, "modules"), rules: listOf(front, "rules"), asks: [...found.text.matchAll(/\b[QG]-\d{2}\b/g)].map((m) => m[0]), plan };
}

// --- diff ---

/** Diff base..head: patch целиком и блок `diff --git` каждого файла как есть: `{patch, files: [{file, text}]}`. */
export function diffOf(root, base, head = "HEAD") {
  const patch = git(root, "diff", "-M", "--no-color", "--no-ext-diff", base, head);
  const files = [];
  for (const block of patch.split(/^(?=diff --git )/m).filter((b) => b.startsWith("diff --git "))) {
    const first = block.slice(0, block.indexOf("\n"));
    files.push({ file: first.slice(first.lastIndexOf(" b/") + 3), text: block.trimEnd() });
  }
  return { patch, files };
}

// Hunk'и brief'а ревьюера (S0-45): оси — hunk'и без её вердикта с причиной выбора каждого, проверке ответов — hunk'и
// дельты. Какие hunk'и задевает ось, решает scope.mjs по её триггерам.
const hunkItems = (hunks) =>
  hunks.map((h) => ({ label: `${h.file}:${h.at}`, value: h.reasons ? { id: h.id, file: h.file, at: h.at, reasons: h.reasons, diff: h.text } : { file: h.file, at: h.at, diff: h.text } }));

/** Добавленные строки блока файла с номерами новой стороны: `[{line, text}]`. */
function addedLines(block) {
  const out = [];
  let line = 0;
  for (const row of block.split("\n")) {
    const hunk = /^@@ -\S+ \+(\d+)/.exec(row);
    if (hunk) line = Number(hunk[1]);
    else if (line && row.startsWith("+") && !row.startsWith("+++")) out.push({ line: line++, text: row.slice(1) });
    else if (line && row.startsWith(" ")) line++;
  }
  return out;
}

/** Hunk блока файла, чья новая сторона держит строку line, или null. */
function hunkAt(block, line) {
  for (const hunk of block.split(/\n(?=@@ )/).slice(1)) {
    const m = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(hunk);
    const from = Number(m[1]);
    if (line >= from && line < from + Math.max(m[2] === undefined ? 1 : Number(m[2]), 1)) return hunk;
  }
  return null;
}

// --- бюджет ---

/** Brief в бюджете. base — поля протокола, не режутся. parts — материал по порядку важности: `{name, value, where}`
 * или `{name, items: [{label, value}], where}`; что не вошло — в cut строкой «имя: метка (N токенов) — где взять». */
function fit(base, parts, budget = BUDGET) {
  const context = {};
  const cut = [];
  let used = tokens(base);
  const room = (n) => used + n <= budget - RESERVE;
  for (const part of parts) {
    if (part.items) {
      context[part.name] = [];
      for (const { label, value } of part.items) {
        const n = tokens(value);
        if (room(n)) {
          context[part.name].push(value);
          used += n;
        } else cut.push(`${part.name}: ${label} (${n} токенов) — ${part.where}`);
      }
    } else if (part.value !== null && part.value !== undefined) {
      const n = tokens(part.value);
      if (room(n)) {
        context[part.name] = part.value;
        used += n;
      } else cut.push(`${part.name} (${n} токенов) — ${part.where}`);
    }
  }
  const listed = cut.length > CUT_LISTED ? [...cut.slice(0, CUT_LISTED), `и ещё ${cut.length - CUT_LISTED}`] : cut;
  const brief = { ...base, context, cut: listed };
  return { ...brief, tokens: tokens(brief) };
}

// --- brief по ролям ---

const taskParts = (task) =>
  task
    ? [
        { name: "task", value: { path: task.path, text: task.text }, where: `файл задачи \`${task.path}\`` },
        { name: "rules", items: [], where: "docs/design" },
        { name: "questions", items: [], where: `\`${task.plan}\`` },
      ]
    : [];

function withTask(root, task) {
  const parts = taskParts(task);
  if (!task) return parts;
  parts[1].items = rulesOf(root, task.rules).map((r) => ({ label: r.id, value: r }));
  parts[2].items = planRows(readText(root, task.plan), task.asks).map((r) => ({ label: r.id, value: r }));
  return parts;
}

/** Brief executor: файл задачи, тексты правил из `rules`, строки Q-NN и G-NN задачи, пункты CONVENTIONS.md по модулям задачи. */
export function executorBrief(base) {
  const task = taskOf(base.worktree, base.task);
  const conventions = task ? conventionsForModules(base.worktree, task.modules) : [];
  return fit(base, [...withTask(base.worktree, task), { name: "conventions", items: conventions.map((c) => ({ label: c.id, value: c })), where: "CONVENTIONS.md" }]);
}

const RULE_IDS = /\b[A-Z]{2}-Z?\d{2}\b/g;
const CONVENTION_IDS = /§\d+\.\d+/g;

const SECTION = /^# (.+): exit (\d+), \d+ ms$/gm;

/**
 * Строки упавших шагов из лога verify или prove: последняя строка — JSON итога со `steps` (scripts/verify.mjs,
 * scripts/prove.mjs); упавший шаг — раздел `# <шаг>: exit <код>, <мс> ms` с кодом не 0: у prove так идут и прогоны
 * test-sets — `# test <test-sets>: …`, — которых нет в его `steps` (S0-43).
 */
function failedSteps(log) {
  if (!log || !existsSync(log)) return [];
  const text = lf(readFileSync(log, "utf8"));
  const rows = text.trimEnd().split("\n");
  let outcome = null;
  try {
    outcome = JSON.parse(rows.at(-1));
  } catch {
    outcome = null;
  }
  if (!Array.isArray(outcome?.steps)) return [{ label: "лог", value: { step: null, output: rows.slice(-200).join("\n") } }];
  const end = text.lastIndexOf("\n{");
  const sections = [...text.matchAll(SECTION)];
  return sections.flatMap((m, i) => {
    const exit = Number(m[2]);
    if (exit === 0) return [];
    const output = text.slice(m.index, i + 1 < sections.length ? sections[i + 1].index - 1 : end);
    return [{ label: m[1], value: { step: m[1], exit, output } }];
  });
}

/**
 * Brief fixer: находки с hunk'ами ветки и текстами их правил, пункты CONVENTIONS.md по путям находок; verify-red —
 * записи run'ов красных test-sets ворот (S0-43: test-set, упавшие тесты, seed, исход) и упавшие шаги из лога.
 */
export function fixerBrief(base, { runs = [] } = {}) {
  const root = base.worktree;
  const all = [...base.findings, ...(base.advice ?? [])];
  const from = git(root, "merge-base", "origin/main", "HEAD").trim();
  const blocks = new Map(diffOf(root, from).files.map((f) => [f.file, f.text]));
  const hunks = all.map((f) => {
    const [file, at] = f.where.split(":");
    const line = Number(at);
    const hunk = blocks.has(file) ? hunkAt(blocks.get(file), line) : null;
    if (hunk) return { label: f.id, value: { id: f.id, where: f.where, hunk } };
    const rows = readText(root, file).split("\n");
    const lo = Math.max(1, line - 5);
    return { label: f.id, value: { id: f.id, where: f.where, lines: `${lo}-${Math.min(rows.length, line + 5)}`, text: rows.slice(lo - 1, line + 5).join("\n") } };
  });
  const ids = all.flatMap((f) => [...(f.rule ?? "").matchAll(RULE_IDS)].map((m) => m[0]));
  const named = new Set(all.flatMap((f) => [...(f.rule ?? "").matchAll(CONVENTION_IDS)].map((m) => m[0])));
  const paths = [...new Set(all.map((f) => f.where.split(":")[0]))];
  const conventions = conventionsOf(readText(root, "CONVENTIONS.md")).items
    .filter((i) => named.has(i.id) || i.areas.some((a) => paths.some((p) => matchesGlob(a, p))))
    .map(item);
  return fit(base, [
    { name: "runs", items: runs.map((r) => ({ label: r.test_set, value: r })), where: "`.lattice/verify-runs/` рабочей копии владельца" },
    { name: "failed", items: failedSteps(base.log), where: `лог \`${base.log}\`` },
    { name: "hunks", items: hunks, where: "`git diff origin/main...HEAD`" },
    { name: "rules", items: rulesOf(root, ids).map((r) => ({ label: r.id, value: r })), where: "docs/design" },
    { name: "conventions", items: conventions.map((c) => ({ label: c.id, value: c })), where: "CONVENTIONS.md" },
  ]);
}

const ORDER = { survived: 0, "budget-exceeded": 1, killed: 2 };

/** Отчёт мутаций для Spec (S0-44): сводка отчёта `prove --ready` и его мутанты с решениями авторов, выжившие первыми. */
function mutationParts({ report, decisions }) {
  const where = "`.lattice/mutants.json` в worktree";
  if (report === null) return [{ name: "mutation", value: { report: null, why: "в worktree нет отчёта `npm run prove --ready`" }, where }];
  const entries = (report.mutants ?? []).map((m) => ({ ...m, decision: decisions[m.id] ?? null }));
  const count = (o) => entries.filter((m) => m.outcome === o).length;
  const summary = { report: ".lattice/mutants.json", head: report.head, dirty: report.dirty, total: entries.length, killed: count("killed"), survived: count("survived"), "budget-exceeded": count("budget-exceeded") };
  const sorted = [...entries].sort((a, b) => (ORDER[a.outcome] ?? 3) - (ORDER[b.outcome] ?? 3));
  return [{ name: "mutation", value: summary, where }, { name: "mutants", items: sorted.map((m) => ({ label: m.id, value: m })), where }];
}

/** Brief ревьюера оси: материал оси, её hunk'и и путь `diff.patch` всего diff ветки. hunks — `[{id?, file, at, reasons?,
 * text}]` или null (conflicts); body — тело PR (Spec) или null; mutation — {report, decisions} для Spec: отчёт
 * `prove --ready` или null и решения. */
export function reviewerBrief(base, { hunks: given, body, mutation = null }) {
  const root = base.worktree;
  const hunks = { name: "hunks", items: hunkItems(given ?? []), where: `\`${base.diff}\`` };
  const parts = [];
  if (base.axis === "spec") {
    const task = taskOf(root, base.task);
    parts.push(...withTask(root, task), { name: "pr_body", value: body, where: `\`gh pr view ${base.pr}\`` });
    if (mutation) parts.push(...mutationParts(mutation));
  }
  if (base.axis === "standards") {
    const paths = [...new Set((given ?? []).map((h) => h.file))];
    const st = [...new Set(paths.flatMap((p) => ST_BY_CLASS[classOf(p)] ?? []))].sort();
    parts.push(
      { name: "conventions", items: conventionsForPaths(root, paths).map((c) => ({ label: c.id, value: c })), where: "CONVENTIONS.md" },
      { name: "st", items: rulesOf(root, st).map((r) => ({ label: r.id, value: r })), where: "docs/design/13-structure.md" },
    );
  }
  if (base.axis === "architecture")
    parts.push(
      { name: "closure", value: readText(root, CLOSURE) || null, where: `\`${CLOSURE}\`` },
      { name: "rm", items: rulesOf(root, ["RM-Z04", "RM-08"]).map((r) => ({ label: r.id, value: r })), where: "docs/design/README.md" },
    );
  return fit(base, [...parts, ...(given ? [hunks] : [])]);
}

// --- материал шага ---

/** Раздел plan-task для шага `pr`, `deviation` или `where` — как написан. */
export function stepText(root, name) {
  return section(readText(root, PLAN_TASK), STEPS[name]);
}

const STRUCTURAL = /^(src|scripts)\/|^test\/support\//;

/** Опись closure-check по diff: новые файлы `scripts/` и `test/support/`, добавленные экспорты `src/`, `scripts/`, `test/support/`. */
function inventoryOf(files) {
  const out = [];
  for (const f of files.filter((x) => STRUCTURAL.test(x.file))) {
    if (/^new file mode/m.test(f.text) && !f.file.startsWith("src/")) out.push({ where: f.file, text: "новый файл" });
    for (const a of addedLines(f.text)) if (/^export\b/.test(a.text)) out.push({ where: `${f.file}:${a.line}`, text: a.text.trim() });
  }
  return out;
}

/** Чем правило показано в test/: фикстуры `test/fixtures/<ID>/` и тесты, чьё название начинается с ID. */
function shownBy(root, id) {
  const out = [];
  if (["trigger", "pass"].every((k) => existsSync(join(root, "test", "fixtures", id, k)))) out.push(`\`test/fixtures/${id}/\` trigger и pass`);
  const walk = (dir) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
  for (const file of walk("test").filter((f) => f.endsWith(".test.ts")))
    if (readText(root, file).includes(`"${id}:`)) out.push(`\`${file}\``);
  return out;
}

/** Самопроверка по diff ветки (merge-base с origin/main..HEAD): триггеры Architecture и опись closure-check по ним,
 * пункты CONVENTIONS.md по путям diff, строки таблицы «Правила» PR по правилам задачи. todo пуст — делать нечего.
 * Строка чистого кода, похожая на класс каталога обходов, Architecture не зовёт (S0-45) — её сверяет executor. */
export function selfcheck(root, taskId) {
  const s = scope({ base: "origin/main", dir: root });
  const { files } = diffOf(root, s.base, s.head);
  const bypass = s.bypass.length ? [`добавленная строка похожа на класс каталога обходов (closure-check): ${s.bypass.slice(0, 10).join(", ")}`] : [];
  const triggers = [...s.reasons.architecture, ...bypass];
  const inventory = triggers.length ? inventoryOf(files) : [];
  const closure = triggers.length ? ["Шаги", "Каталог обходов"].map((h) => section(readText(root, CLOSURE), h)).filter(Boolean).join("\n\n") : null;
  const conventions = conventionsForPaths(root, files.map((f) => f.file));
  const task = taskOf(root, taskId);
  const rules = (task?.rules ?? []).map((id) => {
    const by = shownBy(root, id);
    return { id, row: `| ${id} | ${by.join("; ") || "—"} |`, shown: by.length > 0 };
  });
  const todo = [
    ...(triggers.length ? [`Architecture: ${triggers.join("; ")} — вердикт каждой строке описи (${inventory.length}) и каждому классу каталога (closure)`] : []),
    ...conventions.map((c) => `CONVENTIONS ${c.id} «${c.title}»: ${c.paths.join(", ")}`),
    ...rules.map((r) => (r.shown ? `«Правила» PR: ${r.row}` : `${r.id}: ничем не показано — фикстуры trigger и pass или тест «${r.id}: …»`)),
  ];
  return { base: s.base, head: s.head, todo, architecture: triggers.length ? { triggers, inventory, closure } : null, conventions, rules: rules.map((r) => r.row) };
}

// --- итог ---

/** Строки context_missing из выходов агентов цикла в папке dir: `[{agent, text}]`, agent — путь выхода без `.out.json`. */
export function contextMissing(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of existsSync(d) ? readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)) : []) {
      if (e.isDirectory() && e.name !== "work") walk(join(d, e.name), rel ? `${rel}/${e.name}` : e.name);
      else if (e.name.endsWith(".out.json")) {
        let value = null;
        try {
          value = JSON.parse(readFileSync(join(d, e.name), "utf8"));
        } catch {
          value = null;
        }
        for (const text of Array.isArray(value?.context_missing) ? value.context_missing : [])
          out.push({ agent: `${rel ? `${rel}/` : ""}${e.name.replace(/\.out\.json$/, "")}`, text: String(text) });
      }
    }
  };
  walk(dir, "");
  return out;
}
