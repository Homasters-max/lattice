// scope: что ревьюить — hunk'и ветки и оси, чьи триггеры они задевают (plan/dev-loop.md, «Круги»). Решение детерминировано.
// Hunk — кусок diff ветки merge-base(base, head)..head без контекста. Его id — hash файла, номера среди одинаковых hunk'ов
// файла и строк − и + (S0-45): вердикт оси — evidence с ключом (ось, id); правка hunk'а меняет id, и вердикт теряется.
// Файл без hunk'ов — переименование, бинарный, режим — один hunk из строки статуса.
// Результат {hunks, axes, reasons, stops, triggers, expectations, bypass, delta, rebased, lines, base, head, since}:
//   hunks — [{id, file, at, text, axes: {ось: [причина]}}]: at — строки новой стороны, text — заголовок @@ и строки;
//   axes и reasons — сводка по всем hunk'ам; stops — что требует решения владельца до ревью;
//   triggers — триггеры аудита ST-15; expectations — тест-файлы, где ожидания изменены или отключены (PR-11);
//   bypass — добавленные строки чистого кода, похожие на класс каталога обходов: их сверяет самопроверка executor;
//   delta — hunk'и since..head, прошлого ревьюированного head: их читает проверка ответов; rebased — since не предок head.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { classOf } from "../../../scripts/paths.mjs";
import { conventionsOf } from "./conventions.mjs";

export const HUNK_AXES = ["spec", "standards", "architecture"];
// Признаки классов каталога обходов в добавленной строке чистого кода; строка с отступом — не уровень модуля.
const BYPASS = /\bJSON\.(stringify|parse)\b|\bnew Date\b|\bDate\.now\b|\bMath\.random\b|\bprocess\.|\b(readFileSync|writeFileSync)\b|^let\s|\bthrow\b|\b(skip|force|unsafe)[A-Z_]/;
const EXPORT = /^export\b/;
const DISABLED_TEST = /\.(skip|only|todo)\b|\b(xit|xdescribe)\(/;
// Пути, чьи экспорты держит опись closure-check.
const STRUCTURAL = /^(src|scripts)\/|^test\/support\//;
// Что изменено — по классу пути (scripts/paths.mjs, S0-42): причина Spec и Standards.
const CHANGED = {
  code: "изменён код",
  tests: "изменены тесты",
  task: "изменены файл задачи или PLAN.md",
  design: "изменён docs/design",
  config: "изменена конфигурация",
  conventions: "изменён CONVENTIONS.md",
  text: "текст ветки, где изменены код, тесты или задача",
};
const STANDARDS = ["code", "tests", "config", "conventions"];
const EXPECTATION = "изменено или отключено ожидание теста (PR-11)";

let cwd = process.cwd();
const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const lines = (text) => text.split("\n").filter(Boolean);
const unique = (list) => [...new Set(list)];

// Класс пути — от него зависят оси hunk'а и материал агента — даёт классификатор scripts/paths.mjs (S0-42).

// Файлы diff с переименованиями: {path, old, cls, status A|M|D|R|C|T, lines}.
function changes(from, head) {
  const files = new Map();
  const ns = git("diff", "-M", "-z", "--name-status", from, head).split("\0");
  for (let i = 0; i < ns.length - 1; ) {
    const status = ns[i][0];
    const old = status === "R" || status === "C" ? ns[i + 1] : null;
    const path = old ? ns[i + 2] : ns[i + 1];
    i += old ? 3 : 2;
    files.set(path, { path, old, cls: classOf(path), status, lines: 0 });
  }
  const num = git("diff", "-M", "-z", "--numstat", from, head).split("\0");
  for (let i = 0; i < num.length - 1; ) {
    const [add, del, path] = num[i].split("\t");
    const target = path === "" ? num[i + 2] : path;
    i += path === "" ? 3 : 1;
    files.get(target).lines = (Number(add) || 0) + (Number(del) || 0);
  }
  return [...files.values()];
}

// Hunk'и diff from..head без контекста: {f, header, at, rows, added: [{line, text}]}; rows — строки − и +.
function hunksOf(from, head, files) {
  const out = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const paths = files.flatMap((f) => (f.old ? [f.old, f.path] : [f.path]));
  if (paths.length === 0) return out;
  let file = null;
  let hunk = null;
  let line = 0;
  const close = () => {
    if (hunk) out.push(hunk);
    hunk = null;
  };
  for (const row of git("diff", "-M", "-U0", "--no-color", "--no-ext-diff", from, head, "--", ...paths).split("\n")) {
    if (row.startsWith("diff --git ")) {
      close();
      file = byPath.get(row.slice(row.lastIndexOf(" b/") + 3)) ?? null;
      continue;
    }
    const m = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (file && m) {
      close();
      line = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      hunk = { f: file, header: row, at: count <= 1 ? `${line}` : `${line}-${line + count - 1}`, rows: [], added: [] };
    } else if (hunk && /^[+-]/.test(row)) {
      hunk.rows.push(row);
      if (row.startsWith("+")) hunk.added.push({ line: line++, text: row.slice(1) });
    }
  }
  close();
  // Файл без hunk'ов: переименование без правки, бинарный файл, режим.
  const seen = new Set(out.map((h) => h.f.path));
  for (const f of files.filter((x) => !seen.has(x.path))) {
    const header = `${f.status} ${f.old ? `${f.old} → ` : ""}${f.path}`;
    out.push({ f, header, at: "файл", rows: [header], added: [] });
  }
  return out.sort((a, b) => (a.f.path < b.f.path ? -1 : a.f.path > b.f.path ? 1 : 0));
}

// Id hunk'а: файл, номер среди hunk'ов файла с теми же строками, строки − и +. Номера строк в id не входят:
// правка выше по файлу сдвигает hunk, но не снимает его вердикт.
function withIds(hunks) {
  const count = new Map();
  return hunks.map((h) => {
    const body = h.rows.join("\n");
    const key = `${h.f.path}\0${body}`;
    const n = count.get(key) ?? 0;
    count.set(key, n + 1);
    return { ...h, id: createHash("sha256").update(`${h.f.path}\0${n}\0${body}`).digest("hex").slice(0, 12) };
  });
}

function skeleton(head) {
  try {
    return new Set(lines(git("show", `${head}:test/structure/skeleton-files.txt`)).filter((l) => !l.startsWith("#")));
  } catch {
    return new Set();
  }
}

const moduleOf = (path) => /^src\/([^/]+)\//.exec(path ?? "")?.[1];
// Чистый код (ST-04): модули вне adapters, assembly, cli и тест-хелперы — там каталог обходов ищется по строкам.
const isPure = (f) => f.path.startsWith("test/support/") || !["adapters", "assembly", "cli", undefined].includes(moduleOf(f.path));
const isAdded = (f) => f.status === "A" || f.status === "R" || f.status === "C";
const pathsOf = (f) => (f.old ? [f.path, f.old] : [f.path]);

function isNewModule(from, module) {
  return git("ls-tree", "--name-only", from, `src/${module}/`).trim() === "";
}

function triggersOf(files, from, owned) {
  const modules = [...new Set(files.flatMap((f) => [moduleOf(f.path), moduleOf(f.old)]).filter(Boolean))].sort();
  const added = files.filter(isAdded);
  return {
    skeleton: files.filter((f) => owned.has(f.path) || owned.has(f.old)).map((f) => f.path),
    newModules: [...new Set(added.map((f) => moduleOf(f.path)).filter((m) => m && isNewModule(from, m)))],
    newPorts: added.filter((f) => /^src\/[^/]+\/ports\//.test(f.path)).map((f) => f.path),
    modules: modules.length >= 3 ? modules : [],
  };
}

// Триггеры Architecture одного hunk'а (S0-45): новый или изменённый экспорт, новый модуль или порт, test/support/,
// файл walking skeleton. Прочее — опись closure-check в самопроверке executor.
function architectureOf(h, { owned, triggers }) {
  const f = h.f;
  const out = [];
  if (pathsOf(f).some((p) => STRUCTURAL.test(p)) && h.rows.some((r) => EXPORT.test(r.slice(1).trim()))) out.push("новый или изменённый экспорт (опись closure-check)");
  const module = moduleOf(f.path);
  if (module && triggers.newModules.includes(module)) out.push(`новый модуль ${module} (ST-15)`);
  if (triggers.newPorts.includes(f.path)) out.push("новый порт (ST-15)");
  if (pathsOf(f).some((p) => p.startsWith("test/support/"))) out.push("тест-хелперы test/support/");
  if (pathsOf(f).some((p) => owned.has(p))) out.push("файл walking skeleton (ST-15)");
  return out;
}

// Ожидание изменено: удалена строка с expect, тест отключён, фикстура правила удалена или изменена.
function isExpectation(h) {
  if (h.f.cls !== "tests") return false;
  if (h.f.path.startsWith("test/fixtures/") && h.f.status !== "A") return true;
  return h.rows.some((r) => (r.startsWith("-") && r.includes("expect(")) || (r.startsWith("+") && DISABLED_TEST.test(r)));
}

// Оси hunk'а и причина каждой. Spec — всё, кроме генерируемого, если ветка меняет не только текст; Standards — код,
// тесты, конфигурация, CONVENTIONS.md; Architecture — по своим триггерам.
function axesOf(h, ctx) {
  const axes = {};
  const spec = [];
  if (h.f.cls !== "generated" && ctx.reviewable) spec.push(CHANGED[h.f.cls]);
  if (isExpectation(h)) spec.push(EXPECTATION);
  if (spec.length) axes.spec = unique(spec);
  if (STANDARDS.includes(h.f.cls)) axes.standards = [CHANGED[h.f.cls]];
  const architecture = architectureOf(h, ctx);
  if (architecture.length) axes.architecture = architecture;
  return axes;
}

function stopsOf(branch) {
  const stops = [];
  if (branch.some((f) => f.cls === "design") && !branch.some((f) => f.path === "discussion/decisions.md"))
    stops.push("docs/design изменён без записи в discussion/decisions.md (AGENTS.md)");
  return stops;
}

const shown = (h) => ({ file: h.f.path, at: h.at, text: [h.header, ...(h.rows[0] === h.header ? [] : h.rows)].join("\n") });

export function scope({ base = "origin/main", head = "HEAD", since = null, dir = process.cwd() }) {
  cwd = dir;
  const from = git("merge-base", base, head).trim();
  const at = git("rev-parse", head).trim();
  const files = changes(from, head);
  const owned = skeleton(head);
  const triggers = triggersOf(files, from, owned);
  const ctx = { owned, triggers, reviewable: files.some((f) => f.cls !== "text") };
  const raw = withIds(hunksOf(from, head, files));
  const hunks = raw.map((h) => ({ id: h.id, ...shown(h), axes: axesOf(h, ctx) }));
  const axes = HUNK_AXES.filter((a) => hunks.some((h) => h.axes[a]));
  const reasons = Object.fromEntries(HUNK_AXES.map((a) => [a, unique(hunks.flatMap((h) => h.axes[a] ?? []))]));
  const expectations = unique(raw.filter(isExpectation).map((h) => h.f.path));
  const bypass = raw.filter((h) => STRUCTURAL.test(h.f.path) && isPure(h.f)).flatMap((h) => h.added.filter((a) => BYPASS.test(a.text)).map((a) => `${h.f.path}:${a.line}`));
  const rebased = since !== null && !succeeds("merge-base", "--is-ancestor", since, head);
  const delta = since !== null && !rebased ? hunksOf(since, head, changes(since, head)).map(shown) : [];
  const total = files.reduce((n, f) => n + f.lines, 0);
  return { hunks, axes, reasons, stops: stopsOf(files), triggers, expectations, bypass, delta, rebased, lines: total, base: from, head: at, since };
}

function succeeds(...args) {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Строки новой стороны, которые меняет diff base..head: {файл: [[from, to], …]} — по ним находка получает late.
export function changedLines({ base, head = "HEAD", dir = process.cwd() }) {
  cwd = dir;
  const out = {};
  let file = null;
  for (const row of git("diff", "-M", "-U0", base, head).split("\n")) {
    if (row.startsWith("diff --git ")) file = row.slice(row.lastIndexOf(" b/") + 3);
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(row);
    if (file && hunk) {
      const from = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      (out[file] ??= []).push([from, from + Math.max(count, 1) - 1]);
    }
  }
  return out;
}

// Пункты CONVENTIONS.md из main, которые ветка убрала или переписала: правило меняет владелец, и итог цикла
// выносит их в «Решить владельцу до merge» — `{id, title, gone}`. Пункт сверяется по номеру §N.M (conventions.mjs):
// перестройка файла даёт номера пунктов, а не каждую строку. Файл main без пунктов сверяется по строкам — `{line}`;
// строка, которая только переехала, правила не меняет.
export function conventionsChanged({ main = "origin/main", head = "HEAD", dir = process.cwd() }) {
  cwd = dir;
  const base = git("merge-base", main, head).trim();
  const before = itemsAt(base);
  if (before.size) {
    const after = itemsAt(head);
    return [...before].filter(([id, b]) => after.get(id)?.text !== b.text).map(([id, b]) => ({ id, title: b.title, gone: !after.has(id) }));
  }
  const rows = git("diff", "-U0", base, head, "--", "CONVENTIONS.md").split("\n");
  const added = new Set(rows.filter((r) => r.startsWith("+") && !r.startsWith("+++")).map((r) => r.slice(1)));
  return rows.filter((r) => r.startsWith("-") && !r.startsWith("---") && r.slice(1).trim() && !added.has(r.slice(1))).map((r) => ({ line: r.slice(1) }));
}

// Текст каждого пункта CONVENTIONS.md в ref (conventionsOf).
function itemsAt(ref) {
  let text = "";
  try {
    text = git("show", `${ref}:CONVENTIONS.md`);
  } catch {
    return new Map();
  }
  return new Map(conventionsOf(text).items.map((item) => [item.id, { title: item.title, text: item.text }]));
}
