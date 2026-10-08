// protocol: проверка выхода агента против его brief (plan/dev-loop.md, «Роли: вход и выход»).
// check(brief, out, repo) → {errors, warnings, value}: errors — выход не принят, агент переделывает;
// warnings — выход принят и нормализован (value).
// repo — {head(), remote(branch), commits(from, to), changed(from, to), conventions(), items(), since(), mutants(),
// report(), decided()} в worktree агента; conventions() — текст CONVENTIONS.md worktree, пустой, если файла нет;
// items() — пункты «Готово, когда» файла задачи brief.task, null, если файла нет; since() — начало ветки;
// mutants() — мутанты изменённых hunk'ов src/ (scripts/mutants.mjs), report() — отчёт `prove --ready` или null,
// decided() — решения о мутантах, которые dl помнит: {id: решение}.
import { conventionsOf, unknownReferences } from "./conventions.mjs";

export const AXES = ["spec", "standards", "architecture", "verify"];
export const LETTER = { spec: "S", standards: "T", architecture: "A", verify: "V" };
export const STATUSES = ["closed", "open", "dispute-accepted", "dispute-kept"];
// hunks — ось ревьюирует hunk'и без своего вердикта; answers — статусы находок с ответом автора (S0-45).
export const REVIEW_JOBS = ["hunks", "answers", "conflicts"];
export const FIXER_JOBS = ["answer", "tidy", "verify-red", "rebase", "owner"];
// Критерий находки; тяжесть выводится из него: advice — совет, остальные блокируют.
export const KINDS = ["rule", "scope", "untested", "expectation", "mechanism", "advice"];
// Решение автора о выжившем мутанте (S0-44).
export const DECISIONS = ["killed", "equivalent", "deferred"];
const PLAN_RECORD = /^plan\/phases\/[^/]+\/(PLAN\.md|tasks\/[^/]+\.md)$/;
export const LIMITS = { summary: 800, text: 500, quote: 300, note: 300, question: 500 };
const RULE = /\b[A-Z]{2}-\d{2}\b|CONVENTIONS §\d+|AGENTS\.md|\bS\d-\d{2}:\d+/;
const SHA = /^[0-9a-f]{7,40}$/;
const WHERE = /^[^\s:]+:\d+$/;
const GAP = /^G-\d{2}$/;

const isSha = (s) => typeof s === "string" && SHA.test(s);
const sameSha = (a, b) => isSha(a) && isSha(b) && (a.startsWith(b) || b.startsWith(a));
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function need(errors, ok, message) {
  if (!ok) errors.push(message);
}

// Ошибка называет, что пришло, рядом с тем, что нужно: «axis: нет — нужно verify».
const shown = (v) => {
  if (v === undefined) return "нет";
  if (v === "") return "пусто";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

// Поля выхода по схеме роли (plan/dev-loop.md, «Роли: вход и выход»); других полей в out.json нет.
// context_missing — у всех ролей: что агенту пришлось прочитать сверх brief и зачем (S0-48); итог цикла его печатает.
export const FIELDS = {
  executor: ["status", "pr", "branch", "head", "done", "mutants", "question", "gaps", "context_missing"],
  reviewer: ["axis", "head", "summary", "statuses", "findings", "context_missing"],
  fixer: ["status", "head", "answers", "mutants", "conflicts", "question", "gaps", "context_missing"],
};

function fields(errors, out, role) {
  const extra = Object.keys(out).filter((k) => !FIELDS[role].includes(k));
  need(errors, extra.length === 0, `лишние поля: ${extra.join(", ")} — схема ${role} в plan/dev-loop.md, «Роли: вход и выход»: ${FIELDS[role].join(", ")}`);
  need(errors, out.context_missing === undefined || (Array.isArray(out.context_missing) && out.context_missing.every((c) => text(c, LIMITS.note))),
    `context_missing: ${shown(out.context_missing)} — список строк до ${LIMITS.note} знаков: что прочитано сверх brief и зачем`);
}

// Ссылки на пункты CONVENTIONS.md в text: каждая называет пункт §N.M, который есть в файле worktree.
function references(errors, text, repo, at) {
  if (typeof text !== "string" || !text.includes("CONVENTIONS")) return;
  const ids = new Set(conventionsOf(repo.conventions()).items.map((i) => i.id));
  for (const ref of unknownReferences(text, ids)) errors.push(`${at}: ${ref} — нет такого пункта в CONVENTIONS.md; ссылка — CONVENTIONS §N.M`);
}

function list(errors, value, name) {
  need(errors, Array.isArray(value) && value.every(isObject), `${name}: ${shown(value)} — нужен список объектов, пустой, если нечего`);
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function question(errors, q) {
  need(errors, text(q?.text, LIMITS.question), `question.text: текст вопроса до ${LIMITS.question} знаков`);
  need(errors, Array.isArray(q?.options) && q.options.length >= 2 && q.options.length <= 4 && q.options.every((o) => text(o, 120)),
    "question.options: от 2 до 4 строк до 120 знаков");
  need(errors, text(q?.recommendation, 120), "question.recommendation: рекомендация");
}

// Общее у executor и fixer: gaps, вопрос владельцу, head закоммичен и запушен.
function author(out, errors, repo, branch) {
  need(errors, out.gaps === undefined || (Array.isArray(out.gaps) && out.gaps.every((g) => GAP.test(g))), "gaps: список G-NN");
  if (out.status === "needs_owner") question(errors, out.question);
  if (out.status === "needs_owner" && out.head === undefined) return;
  need(errors, sameSha(out.head, repo.head()), `head: ${shown(out.head)} — не равен HEAD worktree ${repo.head()}: не всё закоммичено`);
  need(errors, sameSha(out.head, repo.remote(branch)), `head: не запушен в origin/${branch}`);
}

// done — пункты «Готово, когда», которые executor выполнил, словами файла задачи: по ним `dl ready` ставит [x] (S0-51).
function done(errors, out, repo) {
  if (out.status !== "ready" && out.done === undefined) return;
  const ok = Array.isArray(out.done) && out.done.length > 0 && out.done.every((d) => text(d, 500));
  need(errors, ok, `done: ${shown(out.done)} — нужен список выполненных пунктов «Готово, когда», словами файла задачи`);
  if (!ok) return;
  const items = repo.items();
  need(errors, items !== null, "done: нет файла задачи в plan/phases/*/tasks — пункты не с чем сверить");
  if (items !== null) out.done.forEach((d, i) => need(errors, items.includes(d.trim()), `done[${i}]: «${shown(d)}» — нет такого пункта «Готово, когда» в файле задачи`));
}

// Решение о мутанте из отчёта `npm run prove --ready` (S0-44): killed — тест, который его убивает, в коммите ветки,
// и отчёт на head это показывает; equivalent и deferred — с причиной.
function decision(errors, d, { known, outcome, commits }) {
  const at = `mutants.${shown(d.id)}`;
  if (!known.has(d.id)) return errors.push(`${at}: нет такого мутанта в изменённых hunk'ах src/ на head`);
  need(errors, DECISIONS.includes(d.decision), `${at}.decision: ${shown(d.decision)} — нужно ${DECISIONS.join(" | ")}`);
  if (d.decision === "killed") {
    need(errors, outcome.get(d.id)?.outcome === "killed", `${at}: killed — но в отчёте на head мутант ${outcome.get(d.id)?.outcome ?? "не назван"}: тест, который его убивает, не в head`);
    need(errors, isSha(d.commit) && commits.some((c) => sameSha(c, d.commit)), `${at}.commit: ${shown(d.commit)} — коммит ветки с тестом, который убивает мутанта`);
  } else if (DECISIONS.includes(d.decision))
    need(errors, text(d.reason, LIMITS.note), `${at}.reason: ${shown(d.reason)} — почему ${d.decision === "equivalent" ? "мутант не меняет поведения" : "мутант отложен и где это записано"}, до ${LIMITS.note} знаков`);
}

const short = (sha) => (typeof sha === "string" ? sha.slice(0, 7) : shown(sha));

// Выжившие мутанты изменённых hunk'ов src/ (S0-44): каждого решает автор — executor до ready, fixer до push;
// решение, которое dl уже помнит, снова не выносится.
function mutants(errors, out, repo) {
  const given = out.mutants === undefined ? [] : list(errors, out.mutants, "mutants");
  const at = repo.mutants();
  if (at.length === 0 && given.length === 0) return;
  const report = repo.report();
  if (report === null || !sameSha(report.head, out.head) || report.dirty !== false) {
    const why = report === null ? "нет отчёта" : report.dirty !== false ? "отчёт снят с незакоммиченными правками" : `отчёт на ${short(report.head)}`;
    return errors.push(`mutants: ${why} — нужен .lattice/mutants.json \`npm run prove --ready\` на head ${short(out.head)} без незакоммиченных правок: мутантов в изменённых hunk'ах src/ — ${at.length}`);
  }
  const outcome = new Map((Array.isArray(report.mutants) ? report.mutants : []).map((m) => [m.id, m]));
  const uncovered = at.filter((m) => !outcome.has(m.id));
  need(errors, uncovered.length === 0, `mutants: отчёт на head не называет мутантов: ${uncovered.slice(0, 5).map((m) => `${m.id} ${m.file}:${m.line}`).join(", ")} — нужен новый \`npm run prove --ready\``);
  const ids = given.map((d) => d.id);
  need(errors, new Set(ids).size === ids.length, "mutants: id повторяется");
  const decided = repo.decided();
  for (const m of at)
    if (outcome.get(m.id)?.outcome === "survived" && !(m.id in decided) && !ids.includes(m.id))
      errors.push(`mutants: выживший ${m.id} не решён — ${m.file}:${m.line} ${m.operator}: ${m.before} → ${m.after}; нужно killed, equivalent или deferred`);
  const commits = given.some((d) => d.decision === "killed") ? repo.commits(repo.since(), out.head) : [];
  for (const d of given) decision(errors, d, { known: new Map(at.map((m) => [m.id, m])), outcome, commits });
}

function executor(out, errors, repo) {
  fields(errors, out, "executor");
  need(errors, ["ready", "needs_owner"].includes(out.status), `status: ${shown(out.status)} — нужно ready | needs_owner`);
  if (out.status === "ready") {
    need(errors, Number.isInteger(out.pr), "pr: номер PR");
    need(errors, text(out.branch, 100), "branch: ветка задачи");
  }
  done(errors, out, repo);
  author(out, errors, repo, out.branch);
  if (out.status === "ready" && isSha(out.head)) mutants(errors, out, repo);
  return out;
}

function finding(errors, f, i, brief, repo) {
  const at = `findings[${i}]`;
  references(errors, f.rule, repo, `${at}.rule`);
  need(errors, KINDS.includes(f.kind), `${at}.kind: ${KINDS.join(" | ")}`);
  need(errors, WHERE.test(f.where ?? ""), `${at}.where: файл:строка`);
  need(errors, text(f.text, LIMITS.text), `${at}.text: что не так и что было бы верно, до ${LIMITS.text} знаков`);
  need(errors, f.quote === undefined || f.quote === "" || text(f.quote, LIMITS.quote), `${at}.quote: до ${LIMITS.quote} знаков`);
  if (f.kind !== "advice")
    need(errors, RULE.test(f.rule ?? "") && text(f.quote, LIMITS.quote), `${at}: kind ${f.kind} блокирует — нужны rule и quote; без них это advice`);
  return { ...f, axis: brief.axis, severity: f.kind === "advice" ? "advice" : "block", ratchet: f.ratchet === true };
}

function status(errors, s, assigned, disputed) {
  need(errors, assigned.has(s.id), `statuses: ${s.id} не поручен этому агенту`);
  need(errors, STATUSES.includes(s.status), `statuses.${s.id}: ${STATUSES.join(" | ")}`);
  if (disputed.has(s.id)) need(errors, s.status !== "open", `statuses.${s.id}: автор оспорил — closed, dispute-accepted или dispute-kept`);
  else need(errors, !s.status?.startsWith("dispute"), `statuses.${s.id}: ${s.status} — автор не оспаривал`);
  need(errors, !["open", "dispute-kept"].includes(s.status) || text(s.note, LIMITS.note), `statuses.${s.id}: note — что осталось или какое правило, до ${LIMITS.note} знаков`);
  return disputed.has(s.id) && s.status === "closed" ? { ...s, status: "dispute-accepted" } : s;
}

function reviewer(brief, out, errors, repo) {
  need(errors, REVIEW_JOBS.includes(brief.job), `brief.job: ${REVIEW_JOBS.join(" | ")}`);
  fields(errors, out, "reviewer");
  need(errors, out.axis === brief.axis, `axis: ${shown(out.axis)} — нужно ${brief.axis}`);
  need(errors, sameSha(out.head, brief.head), `head: ${shown(out.head)} — нужно ${brief.head}`);
  need(errors, text(out.summary, LIMITS.summary), `summary: ${typeof out.summary === "string" ? `${out.summary.length} знаков` : shown(out.summary)} — нужно что проверено, до ${LIMITS.summary} знаков`);
  const assigned = new Set(brief.findings.map((f) => f.id));
  const disputed = new Set(brief.disputed ?? []);
  const statuses = list(errors, out.statuses, "statuses");
  const ids = statuses.map((s) => s.id);
  for (const id of assigned) need(errors, ids.includes(id), `statuses: нет статуса для ${id}`);
  need(errors, new Set(ids).size === ids.length, "statuses: id повторяется");
  const findings = list(errors, out.findings, "findings");
  need(errors, brief.job !== "answers" || findings.length === 0, "findings: поручение answers — только статусы; hunk'и ревьюируют оси");
  return {
    ...out,
    statuses: statuses.map((s) => status(errors, s, assigned, disputed)),
    findings: findings.map((f, i) => finding(errors, f, i, brief, repo)),
  };
}

// Действия ответа: answer — блокирующие находки круга и его советы (S0-45); tidy — советы и находки вне дельты перед
// сдачей. Отложить можно совет, находку вне дельты и решение владельца task или gap; отклонить — только совет.
const ANSWER_JOBS = ["answer", "tidy"];
const ACTIONS = ["fixed", "disputed", "deferred", "declined"];

function answer(errors, a, ctx) {
  const { brief, from, range, changed, advice, deferrable, repo } = ctx;
  need(errors, ACTIONS.includes(a.action), `answers.${a.id}: ${ACTIONS.join(" | ")}`);
  need(errors, a.note === undefined || text(a.note, LIMITS.note), `answers.${a.id}.note: до ${LIMITS.note} знаков`);
  if (a.action === "fixed")
    need(errors, Array.isArray(a.commits) && a.commits.length > 0 && a.commits.every((c) => range.some((r) => sameSha(r, c))),
      `answers.${a.id}: commits — коммиты из ${from.slice(0, 7)}..head`);
  if (a.action === "disputed") {
    need(errors, !advice.has(a.id) && RULE.test(a.note ?? ""), `answers.${a.id}: спор — только о блокирующей находке и с правилом`);
    references(errors, a.note, repo, `answers.${a.id}.note`);
  }
  if (a.action === "deferred") {
    need(errors, deferrable.has(a.id), `answers.${a.id}: отложить можно совет, находку вне дельты или решение владельца task и gap — блокирующую находку исправляют или оспаривают`);
    need(errors, PLAN_RECORD.test(a.where ?? "") && changed.includes(a.where), `answers.${a.id}: where — файл задачи или PLAN.md фазы, изменённый в этом ответе`);
  }
  if (a.action === "declined") need(errors, advice.has(a.id) && text(a.note, LIMITS.note), `answers.${a.id}: отклонить можно только совет, с причиной в note`);
}

function answers(brief, out, errors, repo) {
  const items = list(errors, out.answers, "answers");
  const advice = new Set((brief.advice ?? []).map((f) => f.id));
  const decided = (brief.decisions ?? []).filter((d) => d.action !== "fix").map((d) => d.id);
  const expected = [...brief.findings.map((f) => f.id), ...advice, ...decided];
  const deferrable = new Set([...advice, ...brief.findings.filter((f) => f.late === true).map((f) => f.id), ...decided]);
  const ids = items.map((a) => a.id);
  for (const id of expected) need(errors, ids.includes(id), `answers: нет ответа на ${id}`);
  need(errors, new Set(ids).size === ids.length, "answers: на находку — ровно один ответ");
  // tidy: хвост мог закрыть любой коммит ветки — например, поручение владельца до последнего круга.
  const from = brief.job === "tidy" ? brief.since : brief.base;
  const range = isSha(out.head) ? repo.commits(from, out.head) : [];
  const changed = isSha(out.head) ? repo.changed(brief.base, out.head) : [];
  for (const a of items) {
    need(errors, expected.includes(a.id), `answers: ${a.id} не поручен`);
    answer(errors, a, { brief, from, range, changed, advice, deferrable, repo });
  }
}

function fixer(brief, out, errors, repo) {
  need(errors, FIXER_JOBS.includes(brief.job), `brief.job: ${FIXER_JOBS.join(" | ")}`);
  fields(errors, out, "fixer");
  need(errors, ["done", "needs_owner"].includes(out.status), `status: ${shown(out.status)} — нужно done | needs_owner`);
  author(out, errors, repo, brief.branch);
  need(errors, out.conflicts === undefined || (Array.isArray(out.conflicts) && out.conflicts.every((c) => text(c, 300))), "conflicts: список файлов");
  if (ANSWER_JOBS.includes(brief.job) && out.status === "done") answers(brief, out, errors, repo);
  if (out.status === "done" && isSha(out.head)) mutants(errors, out, repo);
  return out;
}

export function check(brief, out, repo) {
  const errors = [];
  const warnings = [];
  if (!isObject(out)) return { errors: ["выход — не JSON-объект"], warnings, value: null };
  let value = out;
  if (brief.role === "executor") value = executor(out, errors, repo);
  else if (brief.role === "reviewer") value = reviewer(brief, out, errors, repo);
  else if (brief.role === "fixer") value = fixer(brief, out, errors, repo);
  else errors.push(`role: неизвестна ${brief.role}`);
  return { errors, warnings, value };
}
