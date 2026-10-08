#!/usr/bin/env node
// plan-check: согласованность плана работ с дизайном LATTICE и между файлами плана.
//   node plan/tools/plan-check.mjs [--rules] [--root <каталог с docs/ и plan/>]
// Состав фазы — правила по таблице SL-Z04 (срез документа, полные и частичные исключения).
// Ошибки (выход 1): frontmatter задачи; зависимость не существует или цикл; доска и файлы задач расходятся;
// неизвестный статус; ✅ при незавершённой зависимости; ✅ при неотмеченном или пустом «Готово, когда»; фаза ✅ при незавершённых задачах;
// правило из `rules` не существует в дизайне; правило фазы не отнесено ни к одной задаче;
// пункт CONVENTIONS.md без номера §N.M или области путей; ссылка кода или процесса на пункт, которого нет (S0-50).
// Предупреждения: правило другой фазы в `rules`; название на доске не совпадает с файлом; задачи сданы,
// а фаза ещё не в работе; отметки «Готово, когда» у задачи без ✅; RULES.md устарел.
// Доска хранит только итог задачи (⬜, ✅, ✖); что в работе — открытые PR, их инструмент не читает.
// --rules — переписать phases/<фаза>/RULES.md.
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { conventionsOf, unknownReferences } from "./dev-loop/conventions.mjs";

const rootAt = process.argv.indexOf("--root");
const ROOT = rootAt > 0 ? process.argv[rootAt + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESIGN = join(ROOT, "docs", "design");
const PLAN = join(ROOT, "plan");
const WRITE_RULES = process.argv.includes("--rules");

const PHASE_STATUS = ["⬜", "📝", "🔄", "🔍", "✅"];
const TASK_STATUS = ["⬜", "✅", "✖"];
const CLOSED = new Set(["✅", "✖"]);
const WEIGHT = { S: 1, M: 2, L: 3 };

const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---------- markdown

function cells(line) {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "", code = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; continue; }
    if (s[i] === "`") code = !code;
    if (s[i] === "|" && !code) { out.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

function tables(text) {
  const res = [];
  let fence = false, cur = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) { fence = !fence; cur = null; continue; }
    if (fence || !line.startsWith("|")) { cur = null; continue; }
    if (!cur) { cur = { header: cells(line), rows: [] }; res.push(cur); }
    else if (!cur.sep && /^\|[\s|:-]+\|$/.test(line.trim())) cur.sep = true;
    else cur.rows.push(cells(line));
  }
  return res;
}

const tableWith = (text, first) => tables(text).find((t) => t.header[0] === first);

// ---------- дизайн: правила и их срезы

const ID = String.raw`\b([A-Z]{2})-(\d{2})\b(?:\s*…\s*\1-(\d{2})\b)?`;

function idsIn(s) {
  const out = [];
  for (const m of s.replace(/`[^`]*`/g, "").matchAll(new RegExp(ID, "g"))) {
    const [, p, a, b] = m;
    for (let n = +a; n <= +(b ?? a); n++) out.push(`${p}-${String(n).padStart(2, "0")}`);
  }
  return out;
}

function loadDesign() {
  const byDoc = new Map(), docOf = new Map();
  for (const f of readdirSync(DESIGN).filter((f) => f.endsWith(".md")).sort()) {
    let fence = false;
    const ids = [];
    for (const line of read(join(DESIGN, f)).split("\n")) {
      if (line.startsWith("```")) { fence = !fence; continue; }
      if (fence) continue;
      const m = line.match(/^\|\s*([A-Z]{2}-\d{2})\s*\|/) || line.match(/^([A-Z]{2}-\d{2})\./);
      if (m) { ids.push(m[1]); docOf.set(m[1], f); }
    }
    byDoc.set(f, ids);
  }
  const structure = read(join(DESIGN, "13-structure.md"));
  const modules = new Set((tableWith(structure, "Module")?.rows ?? []).map((r) => r[0].replace(/`/g, "")));
  return { byDoc, docOf, modules, slice: loadSlices(byDoc) };
}

// SL-Z04: | Document | Slice | Exceptions |. Исключение «IDs — Sx» полное; с другими словами — частичное.
function loadSlices(byDoc) {
  const text = read(join(DESIGN, "14-slices.md"));
  const rows = tableWith(text.slice(text.indexOf("\nSL-Z04.")), "Document")?.rows ?? [];
  const files = [...byDoc.keys()];
  const docFile = (tok) => (tok === "README" ? "README.md" : files.find((f) => f.startsWith(`${tok}-`)));
  const primary = new Map(), partial = new Map();
  const addPartial = (id, s) => partial.set(id, new Set([...(partial.get(id) ?? []), s]));
  for (const [docCell, sliceCell, exCell = ""] of rows) {
    const slice = sliceCell.match(/\b(S\d|SW)\b/)?.[1];
    for (const tok of docCell.split(",").map((s) => s.trim().split(/\s+/)[0])) {
      for (const id of byDoc.get(docFile(tok)) ?? []) primary.set(id, slice);
    }
    for (const seg of exCell.split(";")) {
      let carry = [];
      for (const [, before, s] of seg.matchAll(/([\s\S]*?)—\s*(S\d|SW|later)/g)) {
        for (const item of before.split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
          const ids = idsIn(item);
          if (!ids.length) { carry.forEach((id) => addPartial(id, s)); continue; }
          const pure = item.replace(new RegExp(ID, "g"), "").trim() === "";
          for (const id of ids) pure ? primary.set(id, s) : addPartial(id, s);
          carry = pure ? [] : ids;
        }
      }
    }
  }
  return { primary, partial };
}

function phaseRules(design, phase) {
  const out = [];
  for (const [doc, ids] of design.byDoc) {
    for (const id of ids) {
      const p = design.slice.primary.get(id), part = design.slice.partial.get(id) ?? new Set();
      if (p !== phase && !part.has(phase)) continue;
      const others = [...new Set([p, ...part])].filter((s) => s && s !== phase).sort();
      const kind = p === phase && !others.length ? "полностью" : "частично";
      out.push({ id, doc, kind, others });
    }
  }
  return out;
}

// ---------- план

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*?)(\s+#.*)?$/);
    if (!kv) continue;
    const v = kv[2];
    o[kv[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean) : v;
  }
  return o;
}

function loadPhases() {
  const t = tableWith(read(join(PLAN, "STATUS.md")), "Фаза");
  if (!t) { err("plan/STATUS.md: нет таблицы фаз"); return []; }
  return t.rows.map(([code, name, status, , , , links = ""]) => {
    const st = PHASE_STATUS.find((s) => status.startsWith(s));
    if (!st) err(`plan/STATUS.md: фаза ${code} — неизвестный статус «${status}»`);
    const dir = links.match(/\(phases\/([^/)]+)\/PLAN\.md\)/)?.[1] ?? null;
    return { code, name, status: st, dir };
  });
}

// Пункты «Готово, когда» файла задачи: сколько отмечено [x] и сколько нет.
function doneMarks(text) {
  const section = /^## Готово, когда\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
  const items = section.split("\n").map((l) => /^- \[([ xX])\]/.exec(l)?.[1]).filter(Boolean);
  return { checked: items.filter((m) => m !== " ").length, unchecked: items.filter((m) => m === " ").length };
}

function loadTasks(phase, design) {
  const dir = join(PLAN, "phases", phase.dir, "tasks");
  const tasks = new Map();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []) {
    const text = read(join(dir, f));
    const fm = frontmatter(text);
    const at = `${phase.dir}/tasks/${f}`;
    if (!fm) { err(`${at}: нет frontmatter`); continue; }
    for (const k of ["id", "title", "phase", "stage", "size", "modules", "depends", "rules"]) {
      if (fm[k] === undefined) err(`${at}: нет поля ${k}`);
    }
    if (!f.startsWith(`${fm.id}-`)) err(`${at}: id ${fm.id} не совпадает с именем файла`);
    if (fm.phase !== phase.code) err(`${at}: phase ${fm.phase}, а лежит в фазе ${phase.code}`);
    if (!WEIGHT[fm.size]) err(`${at}: size «${fm.size}» — не S, M или L`);
    for (const m of fm.modules ?? []) if (!design.modules.has(m)) err(`${at}: модуль ${m} не из матрицы ST-01`);
    for (const r of fm.rules ?? []) if (!design.docOf.has(r)) err(`${at}: правило ${r} не определено в дизайне`);
    tasks.set(fm.id, { ...fm, file: f, at, marks: doneMarks(text) });
  }
  return tasks;
}

function loadBoard(phase, tasks) {
  const path = join(PLAN, "phases", phase.dir, "STATUS.md");
  const t = existsSync(path) && tableWith(read(path), "Задача");
  const status = new Map();
  if (!t) { err(`${phase.dir}/STATUS.md: нет доски задач`); return status; }
  for (const [link, title, , st] of t.rows) {
    const id = link.match(/\[([^\]]+)\]/)?.[1] ?? link;
    const s = TASK_STATUS.find((x) => st.startsWith(x));
    if (!s) err(`${phase.dir}/STATUS.md: ${id} — неизвестный статус «${st}»`);
    if (status.has(id)) err(`${phase.dir}/STATUS.md: ${id} на доске дважды`);
    status.set(id, s);
    const task = tasks.get(id);
    if (!task) err(`${phase.dir}/STATUS.md: ${id} на доске, но файла задачи нет`);
    else {
      if (!link.includes(`(tasks/${task.file})`)) err(`${phase.dir}/STATUS.md: ссылка ${id} не ведёт на tasks/${task.file}`);
      if (title !== task.title) warn(`${phase.dir}/STATUS.md: ${id} — название «${title}», в файле «${task.title}»`);
    }
  }
  for (const id of tasks.keys()) if (!status.has(id)) err(`${phase.dir}/STATUS.md: задачи ${id} нет на доске`);
  return status;
}

// ---------- проверки

function checkGraph(all) {
  for (const t of all.values()) {
    for (const d of t.depends) if (!all.has(d)) err(`${t.at}: зависимость ${d} не существует`);
  }
  const state = new Map();
  let acyclic = true;
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { err(`цикл зависимостей: ${[...path, id].join(" → ")}`); acyclic = false; return; }
    state.set(id, 1);
    for (const d of all.get(id)?.depends ?? []) visit(d, [...path, id]);
    state.set(id, 2);
  };
  for (const id of all.keys()) visit(id, []);
  return acyclic;
}

function checkStatuses(phase, tasks, status, statusOf) {
  const open = (id) => !CLOSED.has(statusOf(id));
  for (const t of tasks.values()) {
    const s = status.get(t.id), waiting = t.depends.filter(open);
    if (s === "✅" && waiting.length) err(`${t.id} ✅, но не завершены зависимости: ${waiting.join(", ")}`);
    if (s === "✅" && t.marks.unchecked) err(`${t.at}: ✅ на доске, но в «Готово, когда» не отмечено пунктов: ${t.marks.unchecked}`);
    if (s === "✅" && !t.marks.checked && !t.marks.unchecked) err(`${t.at}: ✅ на доске, но в «Готово, когда» нет пунктов [x]`);
    if (s === "⬜" && t.marks.checked) warn(`${t.at}: в «Готово, когда» отмечено ${t.marks.checked}, а на доске ⬜`);
  }
  const unfinished = [...status].filter(([, s]) => !CLOSED.has(s)).map(([id]) => id);
  if (phase.status === "✅" && unfinished.length) err(`${phase.code} ✅, но не завершены: ${unfinished.join(", ")}`);
  const started = [...status.values()].some((s) => s === "✅");
  if ((phase.status === "⬜" || phase.status === "📝") && started) warn(`${phase.code}: задачи сданы, а фаза — ${phase.status}`);
}

function checkCoverage(phase, tasks, rules) {
  const inPhase = new Set(rules.map((r) => r.id));
  const owners = new Map();
  for (const t of tasks.values()) {
    for (const r of t.rules) {
      owners.set(r, [...(owners.get(r) ?? []), t]);
      if (!inPhase.has(r)) warn(`${t.id}: правило ${r} не из фазы ${phase.code}`);
    }
  }
  const missing = rules.filter((r) => !owners.has(r.id)).map((r) => r.id);
  if (missing.length) err(`${phase.code}: правила фазы не отнесены ни к одной задаче: ${missing.join(", ")}`);
  return owners;
}

// ---------- сводка

function criticalPath(tasks, status) {
  const memo = new Map();
  const best = (id) => {
    if (memo.has(id)) return memo.get(id);
    const t = tasks.get(id);
    const own = CLOSED.has(status.get(id)) ? 0 : WEIGHT[t.size] ?? 0;
    let tail = { w: 0, path: [] };
    for (const d of t.depends.filter((d) => tasks.has(d))) {
      const c = best(d);
      if (c.w > tail.w) tail = c;
    }
    const r = { w: tail.w + own, path: own ? [...tail.path, id] : tail.path };
    memo.set(id, r);
    return r;
  };
  return [...tasks.keys()].map(best).reduce((a, b) => (b.w > a.w ? b : a), { w: 0, path: [] });
}

function rulesMarkdown(phase, rules, owners) {
  const link = (t) => `[${t.id}](tasks/${t.file})`;
  const part = rules.filter((r) => r.kind === "частично").length;
  const lines = [
    `# ${phase.code} · правила → задачи`,
    "",
    "Генерируется командой `node plan/tools/plan-check.mjs --rules` из frontmatter задач и таблицы SL-Z04; руками не правится.",
    "",
    `Правил фазы — ${rules.length}: полностью — ${rules.length - part}, частично — ${part}. Частичность здесь — по SL-Z04; что в S0 делается частично сверх неё, — в PLAN.md, раздел 2.`,
  ];
  for (const doc of [...new Set(rules.map((r) => r.doc))]) {
    lines.push("", `## ${doc}`, "", "| Правило | В фазе | Задачи |", "|---|---|---|");
    for (const r of rules.filter((x) => x.doc === doc)) {
      const kind = r.others.length ? `${r.kind}; остальное — ${r.others.join(", ")}` : r.kind;
      lines.push(`| ${r.id} | ${kind} | ${(owners.get(r.id) ?? []).map(link).join(", ") || "—"} |`);
    }
  }
  return lines.join("\n") + "\n";
}

// ---------- CONVENTIONS.md (S0-50)

// Где ссылаются на пункты CONVENTIONS.md: код, тесты, скрипты и процесс. Задачи и PLAN.md фаз — история, их ссылки
// не правятся; test/tools — данные тестов инструментов; .claude/worktrees — рабочие копии других сессий, не репо.
const REFERRERS = ["AGENTS.md", "CONVENTIONS.md", "plan/dev-loop.md", "plan/closure-check.md", ".claude", "src", "test", "scripts"];
const READ_FOR_REFERENCES = /\.(md|ts|mjs|js)$/;
const NOT_REFERRERS = /^(test\/tools|\.claude\/worktrees)\//;

function filesUnder(path) {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full, { recursive: true, encoding: "utf8" })
    .map((f) => `${path}/${f.replaceAll("\\", "/")}`)
    .filter((f) => READ_FOR_REFERENCES.test(f) && !NOT_REFERRERS.test(f) && statSync(join(ROOT, f)).isFile());
}

function checkConventions() {
  const file = join(ROOT, "CONVENTIONS.md");
  if (!existsSync(file)) return;
  const { items, problems } = conventionsOf(read(file));
  problems.forEach(err);
  const ids = new Set(items.map((i) => i.id));
  for (const path of REFERRERS.flatMap(filesUnder))
    read(join(ROOT, path)).split("\n").forEach((line, i) => {
      for (const ref of unknownReferences(line, ids)) err(`${path}:${i + 1}: CONVENTIONS ${ref} — нет такого пункта; ссылка называет пункт §N.M`);
    });
}

// ---------- main

const design = loadDesign();
const phases = loadPhases();
const planned = phases.filter((p) => p.dir && existsSync(join(PLAN, "phases", p.dir)));
const perPhase = planned.map((p) => ({ phase: p, tasks: loadTasks(p, design) }));
const all = new Map(perPhase.flatMap(({ tasks }) => [...tasks]));
const acyclic = checkGraph(all);
for (const x of perPhase) x.status = loadBoard(x.phase, x.tasks);
const statusOf = (id) => perPhase.find((x) => x.status.has(id))?.status.get(id);
checkConventions();

const total = [...design.byDoc.values()].flat().length;
console.log(`plan-check: в дизайне ${total} правил; фаз с планом — ${planned.length} из ${phases.length}`);
for (const x of perPhase) {
  const { phase, tasks, status } = x;
  checkStatuses(phase, tasks, status, statusOf);
  const rules = phaseRules(design, phase.code);
  const owners = checkCoverage(phase, tasks, rules);
  const rulesPath = join(PLAN, "phases", phase.dir, "RULES.md");
  const md = rulesMarkdown(phase, rules, owners);
  if (WRITE_RULES) writeFileSync(rulesPath, md);
  else if (!existsSync(rulesPath) || read(rulesPath) !== md) warn(`${phase.dir}/RULES.md устарел — запустите с --rules`);

  const count = (s) => [...status.values()].filter((v) => v === s).length;
  const done = count("✅") + count("✖");
  const ready = [...tasks.values()].filter((t) => status.get(t.id) === "⬜" && t.depends.every((d) => CLOSED.has(statusOf(d)))).map((t) => t.id);
  const cp = acyclic ? criticalPath(tasks, status) : { w: "?", path: ["не считается: есть цикл"] };
  const audit = [...tasks.values()].filter((t) => t.modules.length >= 3).map((t) => t.id);
  console.log(`\n${phase.code} ${phase.name} [${phase.status}] — правил ${rules.length}, задач ${tasks.size}, готово ${done} (${Math.round((100 * done) / (tasks.size || 1))}%)`);
  console.log(`  ${TASK_STATUS.map((s) => `${s} ${count(s)}`).join(" · ")}`);
  console.log(`  готовы к старту (без открытого PR — сверь с gh pr list): ${ready.join(", ") || "—"}`);
  console.log(`  критический путь (S=1, M=2, L=3; осталось ${cp.w}): ${cp.path.join(" → ") || "—"}`);
  console.log(`  триггеры аудита ST-15 (≥3 модулей): ${audit.join(", ") || "—"}`);
}

console.log(`\nошибок ${errors.length}, предупреждений ${warnings.length}${WRITE_RULES ? "; RULES.md переписаны" : ""}`);
for (const e of errors) console.log(`  ✗ ${e}`);
for (const w of warnings) console.log(`  ! ${w}`);
process.exit(errors.length ? 1 : 0);
