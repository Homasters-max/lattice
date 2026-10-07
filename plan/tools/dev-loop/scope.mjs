// scope: что ревьюить в круге — режим и оси (plan/dev-loop.md, «Круги»). Решение детерминировано.
// Круг 1: base — origin/main, diff от merge-base. Следующие круги: base — прошлый ревьюированный head, delta.
// main — от него считается вся ветка для stops.
// Результат {mode, axes, reasons, stops, triggers, expectations, rebased, lines, base, head}:
//   mode — none (ревью не нужен) | verify (дельта мала: проверка закрытия находок) | review (оси из axes);
//   reasons — почему выбрана каждая ось; stops — что требует решения владельца до ревью;
//   triggers — триггеры аудита ST-15; expectations — тест-файлы, где ожидания изменены или отключены (PR-11);
//   rebased — base не предок head: дельту посчитать нельзя, нужен круг без delta.
import { execFileSync } from "node:child_process";

const VERIFY_MAX_LINES = 40;
// Признаки классов каталога обходов в добавленной строке чистого кода; строка с отступом — не уровень модуля.
const BYPASS = /\bJSON\.(stringify|parse)\b|\bnew Date\b|\bDate\.now\b|\bMath\.random\b|\bprocess\.|\b(readFileSync|writeFileSync)\b|^let\s|\bthrow\b|\b(skip|force|unsafe)[A-Z_]/;
const IMPORT_EXPORT = /^(import|export)\b/;
const DISABLED_TEST = /\.(skip|only|todo)\b|\b(xit|xdescribe)\(/;

let cwd = process.cwd();
const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const lines = (text) => text.split("\n").filter(Boolean);

function classOf(path) {
  if (path.startsWith("docs/design/")) return "design";
  if (/^(src|scripts|plan\/tools|discussion\/tools)\//.test(path)) return "code";
  if (/^(gen|store)\//.test(path)) return "generated";
  if (path.startsWith("test/")) return "tests";
  if (/^(package(-lock)?\.json|tsconfig[^/]*\.json|eslint\.config\.js|vitest\.config\.ts|\.gitattributes)$|^\.github\//.test(path)) return "config";
  if (path === "CONVENTIONS.md") return "conventions";
  if (/^plan\/phases\/[^/]+\/(tasks\/|PLAN\.md$)/.test(path)) return "task";
  return "text";
}

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

// Строки hunk'ов (+ и −) по файлам — без заголовков diff.
function hunkLines(from, head, files) {
  const out = new Map();
  const paths = files.flatMap((f) => (f.old ? [f.old, f.path] : [f.path]));
  if (paths.length === 0) return out;
  let file = null;
  for (const row of git("diff", "-M", "-U0", from, head, "--", ...paths).split("\n")) {
    if (row.startsWith("diff --git ")) file = row.slice(row.lastIndexOf(" b/") + 3);
    else if (row.startsWith("+++ ") || row.startsWith("--- ") || row.startsWith("@@")) continue;
    else if (file && /^[+-]/.test(row)) (out.get(file) ?? out.set(file, []).get(file)).push(row);
  }
  return out;
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

function isNewModule(from, module) {
  return git("ls-tree", "--name-only", from, `src/${module}/`).trim() === "";
}

function triggersOf(files, from, head) {
  const owned = skeleton(head);
  const modules = [...new Set(files.flatMap((f) => [moduleOf(f.path), moduleOf(f.old)]).filter(Boolean))].sort();
  const added = files.filter((f) => f.status === "A" || f.status === "R" || f.status === "C");
  return {
    skeleton: files.filter((f) => owned.has(f.path) || owned.has(f.old)).map((f) => f.path),
    newModules: [...new Set(added.map((f) => moduleOf(f.path)).filter((m) => m && isNewModule(from, m)))],
    newPorts: added.filter((f) => /^src\/[^/]+\/ports\//.test(f.path)).map((f) => f.path),
    modules: modules.length >= 3 ? modules : [],
  };
}

function architectureReasons(files, hunks, triggers) {
  const reasons = [];
  const structural = (f) => /^(src|scripts)\/|^test\/support\//.test(f.path) || /^(src|scripts)\/|^test\/support\//.test(f.old ?? "");
  const body = (path) => (hunks.get(path) ?? []).map((l) => l.slice(1).trim());
  const touched = files.filter(structural);
  if (touched.some((f) => f.status !== "M")) reasons.push("файл добавлен, удалён или переименован в src/, scripts/ или test/support/");
  if (touched.some((f) => body(f.path).some((l) => IMPORT_EXPORT.test(l)))) reasons.push("изменены импорты или экспорты (опись closure-check)");
  if (touched.filter(isPure).some((f) => (hunks.get(f.path) ?? []).some((l) => l.startsWith("+") && BYPASS.test(l.slice(1)))))
    reasons.push("добавленная строка похожа на класс каталога обходов (closure-check)");
  if (files.some((f) => f.path.startsWith("test/support/"))) reasons.push("тест-хелперы test/support/");
  if (files.some((f) => f.path.startsWith("src/assembly/"))) reasons.push("сборка src/assembly/");
  if (files.some((f) => f.path === "package.json")) reasons.push("package.json");
  if (files.some((f) => f.cls === "design")) reasons.push("docs/design");
  if (files.some((f) => f.cls === "generated")) reasons.push("генерируемые файлы gen/ или store/ (AG-11)");
  if (triggers.skeleton.length) reasons.push("файл walking skeleton (ST-15)");
  if (triggers.modules.length) reasons.push("задеты три модуля и больше (ST-15)");
  return reasons;
}

// Ожидание изменено: удалена строка с expect, тест отключён, фикстура правила удалена или изменена.
function expectationsOf(files, hunks) {
  const changed = (f) => (hunks.get(f.path) ?? []).some((l) => (l.startsWith("-") && l.includes("expect(")) || (l.startsWith("+") && DISABLED_TEST.test(l)));
  const fixture = (f) => f.path.startsWith("test/fixtures/") && f.status !== "A";
  return files.filter((f) => f.cls === "tests" && (fixture(f) || changed(f))).map((f) => f.path);
}

function stopsOf(branch, hunks, delta) {
  const stops = [];
  if (branch.some((f) => f.cls === "design") && !branch.some((f) => f.path === "discussion/decisions.md"))
    stops.push("docs/design изменён без записи в discussion/decisions.md (AGENTS.md)");
  if (delta && (hunks.get("CONVENTIONS.md") ?? []).some((l) => l.startsWith("-")))
    stops.push("в ответе на ревью изменены или удалены строки CONVENTIONS.md: правило меняет владелец");
  return stops;
}

function specReasons(has, expectations, delta) {
  const reasons = [];
  if (has("code")) reasons.push("изменён код");
  if (has("task")) reasons.push("изменены файлы задачи или PLAN.md");
  if (has("design", "config", "generated")) reasons.push("изменены docs/design, конфигурация или генерируемые файлы");
  if (expectations.length) reasons.push("изменены или отключены ожидания тестов (PR-11)");
  if (!delta && has("tests")) reasons.push("изменены тесты");
  return reasons;
}

export function scope({ base, head = "HEAD", delta = false, main = "origin/main", dir = process.cwd() }) {
  cwd = dir;
  if (delta && !succeeds("merge-base", "--is-ancestor", base, head)) return { rebased: true };
  const from = delta ? base : git("merge-base", base, head).trim();
  const files = changes(from, head);
  const has = (...cls) => files.some((f) => cls.includes(f.cls) || cls.includes(classOf(f.old ?? "")));
  const hunks = hunkLines(from, head, files.filter((f) => ["code", "tests", "conventions"].includes(f.cls)));
  const triggers = triggersOf(files, from, head);
  const expectations = expectationsOf(files, hunks);
  const total = files.reduce((n, f) => n + f.lines, 0);
  const branch = delta && succeeds("rev-parse", "--verify", main) ? changes(git("merge-base", main, head).trim(), head) : files;
  const reasons = {
    spec: specReasons(has, expectations, delta),
    standards: has("code", "tests", "config", "conventions") ? ["изменены код, тесты, конфигурация или CONVENTIONS.md"] : [],
    architecture: architectureReasons(files, hunks, triggers),
  };

  const small = delta && total <= VERIFY_MAX_LINES && !has("design", "config", "conventions", "generated")
    && files.every((f) => f.status === "M") && reasons.architecture.length === 0 && expectations.length === 0;
  let mode = "review";
  if (!has("code", "tests", "config", "conventions", "design", "generated", "task")) mode = delta ? "verify" : "none";
  else if (small) mode = "verify";
  if (mode === "review" && !reasons.spec.length && !reasons.standards.length && !reasons.architecture.length)
    reasons.spec.push("изменения выше порога проверки закрытия");

  const axes = mode === "review" ? ["spec", "standards", "architecture"].filter((a) => reasons[a].length) : [];
  const stops = stopsOf(branch, hunks, delta);
  return { mode, axes, reasons, stops, triggers, expectations, rebased: false, lines: total, base: from, head: git("rev-parse", head).trim() };
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
