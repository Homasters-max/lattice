// protocol: проверка выхода агента против его brief (plan/dev-loop.md, «Роли: вход и выход»).
// check(brief, out, repo) → {errors, warnings, value}: errors — выход не принят, агент переделывает;
// warnings — выход принят и нормализован (value). repo — {head(), remote(branch), commits(from, to)} в worktree агента.

export const AXES = ["spec", "standards", "architecture", "verify"];
export const LETTER = { spec: "S", standards: "T", architecture: "A", verify: "V" };
export const STATUSES = ["closed", "open", "dispute-accepted", "dispute-kept"];
export const REVIEW_JOBS = ["full", "delta", "close", "status", "conflicts"];
export const FIXER_JOBS = ["answer", "verify-red", "rebase", "owner"];
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

function list(errors, value, name) {
  need(errors, Array.isArray(value) && value.every(isObject), `${name}: список объектов`);
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
  need(errors, sameSha(out.head, repo.head()), "head: не равен HEAD worktree — не всё закоммичено");
  need(errors, sameSha(out.head, repo.remote(branch)), `head: не запушен в origin/${branch}`);
}

function executor(out, errors, repo) {
  need(errors, ["ready", "needs_owner"].includes(out.status), "status: ready | needs_owner");
  if (out.status === "ready") {
    need(errors, Number.isInteger(out.pr), "pr: номер PR");
    need(errors, text(out.branch, 100), "branch: ветка задачи");
  }
  author(out, errors, repo, out.branch);
  return out;
}

function finding(errors, warnings, f, i, brief) {
  const at = `findings[${i}]`;
  need(errors, ["block", "advice"].includes(f.severity), `${at}.severity: block | advice`);
  need(errors, WHERE.test(f.where ?? ""), `${at}.where: файл:строка`);
  need(errors, text(f.text, LIMITS.text), `${at}.text: что не так и что было бы верно, до ${LIMITS.text} знаков`);
  need(errors, f.quote === undefined || f.quote === "" || text(f.quote, LIMITS.quote), `${at}.quote: до ${LIMITS.quote} знаков`);
  const value = { ...f, axis: brief.axis, ratchet: f.ratchet === true };
  if (f.severity === "block" && !(RULE.test(f.rule ?? "") && text(f.quote, LIMITS.quote))) {
    warnings.push(`${at}: block без rule или quote — стал советом`);
    return { ...value, severity: "advice" };
  }
  return value;
}

function status(errors, s, assigned, disputed) {
  need(errors, assigned.has(s.id), `statuses: ${s.id} не поручен этому агенту`);
  need(errors, STATUSES.includes(s.status), `statuses.${s.id}: ${STATUSES.join(" | ")}`);
  if (disputed.has(s.id)) need(errors, s.status !== "open", `statuses.${s.id}: автор оспорил — closed, dispute-accepted или dispute-kept`);
  else need(errors, !s.status?.startsWith("dispute"), `statuses.${s.id}: ${s.status} — автор не оспаривал`);
  need(errors, !["open", "dispute-kept"].includes(s.status) || text(s.note, LIMITS.note), `statuses.${s.id}: note — что осталось или какое правило, до ${LIMITS.note} знаков`);
  return disputed.has(s.id) && s.status === "closed" ? { ...s, status: "dispute-accepted" } : s;
}

function reviewer(brief, out, errors, warnings) {
  need(errors, REVIEW_JOBS.includes(brief.job), `brief.job: ${REVIEW_JOBS.join(" | ")}`);
  need(errors, out.axis === brief.axis, `axis: ${brief.axis}`);
  need(errors, sameSha(out.head, brief.head), `head: ${brief.head}`);
  need(errors, text(out.summary, LIMITS.summary), `summary: что проверено, до ${LIMITS.summary} знаков`);
  const assigned = new Set(brief.findings.map((f) => f.id));
  const disputed = new Set(brief.disputed ?? []);
  const statuses = list(errors, out.statuses, "statuses");
  const ids = statuses.map((s) => s.id);
  for (const id of assigned) need(errors, ids.includes(id), `statuses: нет статуса для ${id}`);
  need(errors, new Set(ids).size === ids.length, "statuses: id повторяется");
  const findings = list(errors, out.findings, "findings");
  need(errors, brief.job !== "status" || findings.length === 0, "findings: поручение status — только статусы");
  return {
    ...out,
    statuses: statuses.map((s) => status(errors, s, assigned, disputed)),
    findings: findings.map((f, i) => finding(errors, warnings, f, i, brief)),
  };
}

function answers(brief, out, errors, repo) {
  const items = list(errors, out.answers, "answers");
  const expected = [...brief.findings.map((f) => f.id), ...(brief.decisions ?? []).filter((d) => d.action !== "fix").map((d) => d.id)];
  const ids = items.map((a) => a.id);
  for (const id of expected) need(errors, ids.includes(id), `answers: нет ответа на ${id}`);
  need(errors, new Set(ids).size === ids.length, "answers: на находку — ровно один ответ");
  const range = isSha(out.head) ? repo.commits(brief.base, out.head) : [];
  for (const a of items) {
    need(errors, expected.includes(a.id), `answers: ${a.id} не поручен`);
    need(errors, ["fixed", "disputed"].includes(a.action), `answers.${a.id}: fixed | disputed`);
    need(errors, a.note === undefined || text(a.note, LIMITS.note), `answers.${a.id}.note: до ${LIMITS.note} знаков`);
    if (a.action === "fixed")
      need(errors, Array.isArray(a.commits) && a.commits.length > 0 && a.commits.every((c) => range.some((r) => sameSha(r, c))),
        `answers.${a.id}: commits — коммиты этого ответа (${brief.base.slice(0, 7)}..head)`);
    if (a.action === "disputed") need(errors, RULE.test(a.note ?? ""), `answers.${a.id}: довод называет правило`);
  }
  for (const a of list(errors, out.advice ?? [], "advice")) {
    need(errors, (brief.advice ?? []).some((f) => f.id === a.id), `advice: ${a.id} нет среди советов`);
    need(errors, typeof a.applied === "boolean", `advice.${a.id}.applied: true | false`);
  }
}

function fixer(brief, out, errors, repo) {
  need(errors, FIXER_JOBS.includes(brief.job), `brief.job: ${FIXER_JOBS.join(" | ")}`);
  need(errors, ["done", "needs_owner"].includes(out.status), "status: done | needs_owner");
  author(out, errors, repo, brief.branch);
  need(errors, out.conflicts === undefined || (Array.isArray(out.conflicts) && out.conflicts.every((c) => text(c, 300))), "conflicts: список файлов");
  if (brief.job === "answer" && out.status === "done") answers(brief, out, errors, repo);
  return out;
}

export function check(brief, out, repo) {
  const errors = [];
  const warnings = [];
  if (!isObject(out)) return { errors: ["выход — не JSON-объект"], warnings, value: null };
  let value = out;
  if (brief.role === "executor") value = executor(out, errors, repo);
  else if (brief.role === "reviewer") value = reviewer(brief, out, errors, warnings);
  else if (brief.role === "fixer") value = fixer(brief, out, errors, repo);
  else errors.push(`role: неизвестна ${brief.role}`);
  return { errors, warnings, value };
}
