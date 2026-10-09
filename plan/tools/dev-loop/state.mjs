// state: состояние цикла и его переходы (plan/dev-loop.md, «Круги»). Чистые функции.
// Состояние: {pr, task, branch, budget, wave, head, base, waves[], findings[], answers, decisions[], gaps[], triggers,
//   pending — вопрос владельцу {why, question?, agent?, job?, findings?}, owner — ответ владельца агенту {text, agent, job?},
//   tidied — круг tidy пройден, stopped, mutants — решения авторов о мутантах {id: {decision, commit?, reason?, by}} (S0-44),
//   reviewedBy — какие оси просмотрели hunk'и ветки, вердикты осей {id hunk'а: буквы осей LETTER} (S0-45; не verdict
//   глоссария, TR-32), unreviewed — число hunk'ов head
//   без вердикта нужной оси, steps — шаги цикла и их время (clock.mjs)}.
// Статусы находки: open, dispute-kept, closed, dispute-accepted, advice, applied, deferred (+ deferredTo), declined, owner-closed.
// Находка: {id, axis, severity, rule, where, quote, text, ratchet, late, wave, status, history[{wave, status, note}]}.
import { greenHead } from "./clock.mjs";
import { LETTER } from "./protocol.mjs";
import { HUNK_AXES } from "./scope.mjs";

export const BUDGET = 3;
export const OWNER_ACTIONS = ["fix", "drop", "task", "gap", "stop"];
const DUPLICATE_LINES = 3;

export function initial({ pr, task, branch, gaps = [] }) {
  return { pr, task, branch, budget: BUDGET, wave: 0, head: null, base: null, waves: [], findings: [], answers: null, decisions: [], gaps, triggers: null, pending: null, owner: null, tidied: false, stopped: false, mutants: {}, reviewedBy: {}, unreviewed: 0, steps: [] };
}

/** Решения автора о мутантах из его выхода (S0-44) — в состоянии по id мутанта: решённого dl больше не выносит. */
export function rememberMutants(state, out, role) {
  const given = Array.isArray(out?.mutants) ? out.mutants : [];
  if (given.length === 0) return state;
  const mutants = { ...(state.mutants ?? {}) };
  for (const { id, decision, commit, reason } of given) mutants[id] = { decision, commit, reason, by: role };
  return { ...state, mutants };
}

/** Пробелы G-NN из выхода автора — в состоянии: итог цикла сверяет их с PLAN.md (render.mjs, final). */
export const rememberGaps = (state, out) => ({ ...state, gaps: [...new Set([...(state.gaps ?? []), ...(out?.gaps ?? [])])] });

const isOpen = (f) => f.severity === "block" && (f.status === "open" || f.status === "dispute-kept");
export const openFindings = (state) => state.findings.filter(isOpen);
const disputedIds = (state) => (state.answers?.items ?? []).filter((a) => a.action === "disputed").map((a) => a.id);
// Хвосты перед сдачей: советы и блокирующие находки вне дельты. Круг tidy решает каждый.
export const looseFindings = (state) => state.findings.filter((f) => f.status === "advice" || (isOpen(f) && f.late));

// Находки, которые поручение владельца называет по id (W5-S1): открытые блокирующие и советы — на них fixer job owner
// отвечает, как в answer; прочие id поручения в brief не идут.
export function namedFindings(state, text) {
  const ids = new Set(String(text ?? "").match(/\bW\d+-[A-Z]\d+\b/g) ?? []);
  return { findings: openFindings(state).filter((f) => ids.has(f.id)), advice: state.findings.filter((f) => f.status === "advice" && ids.has(f.id)) };
}

// Вердикт оси — evidence с ключом (ось, hunk) (S0-45): ось смотрела этот hunk, и он с тех пор не менялся.
const isReviewed = (reviewedBy, id, axis) => (reviewedBy[id] ?? "").includes(LETTER[axis]);
// Hunk'и без действующего вердикта оси — среди тех, чьи триггеры её задевают.
const unreviewedOf = (hunks, reviewedBy, axis) => hunks.filter((h) => h.axes[axis] && !isReviewed(reviewedBy, h.id, axis));
const countUnreviewed = (hunks, reviewedBy) => hunks.filter((h) => HUNK_AXES.some((a) => h.axes[a] && !isReviewed(reviewedBy, h.id, a))).length;
// Открытые находки, на которые автор ответил: их статусы ставит проверка ответов.
function answeredFindings(state) {
  const ids = new Set((state.answers?.items ?? []).map((a) => a.id));
  return openFindings(state).filter((f) => ids.has(f.id));
}

// Агенты круга: ось — с hunk'ами без её вердикта, которые задевают её триггеры (job hunks); verifier — со статусами
// находок с ответом (job answers). axes — только эти оси (старт вместе с воротами); skip — агенты, уже начатые
// в этом круге: их hunk'и, которые с тех пор изменились, остаются без вердикта и идут в следующий круг.
export function planWave(state, scope, { axes = null, skip = [] } = {}) {
  const wave = state.wave + 1;
  const reviewedBy = state.reviewedBy ?? {};
  const wanted = (axis, agent) => (axes === null || axes.includes(axis)) && !skip.includes(agent);
  const agents = [];
  const reasons = {};
  for (const axis of HUNK_AXES) {
    const hunks = unreviewedOf(scope.hunks, reviewedBy, axis);
    if (hunks.length === 0 || !wanted(axis, `reviewer-${axis}`)) continue;
    reasons[axis] = [...new Set(hunks.flatMap((h) => h.axes[axis]))];
    agents.push({ agent: `reviewer-${axis}`, axis, job: "hunks", findings: [], hunks: hunks.map(({ id, file, at, text, axes: why }) => ({ id, file, at, reasons: why[axis], text })) });
  }
  const answered = answeredFindings(state);
  if (answered.length && wanted("verify", "verifier")) agents.push({ agent: "verifier", axis: "verify", job: "answers", findings: answered });
  return { wave, agents, reasons, disputed: disputedIds(state) };
}

function isDuplicate(state, f) {
  const [file, line] = f.where.split(":");
  return state.findings.some((g) => isOpen(g) && g.rule === f.rule && g.where.split(":")[0] === file && Math.abs(Number(g.where.split(":")[1]) - Number(line)) <= DUPLICATE_LINES);
}

const inChanged = (changed, where) => {
  const [file, line] = where.split(":");
  return (changed[file] ?? []).some(([from, to]) => Number(line) >= from && Number(line) <= to);
};

// Строки hunk'ов, которые ось получила в brief'е круга, — {ось: {файл: [[from, to], …]}}: находка в них не late,
// даже если head с прошлого круга не менялся (S0-45). Hunk без строк (переименование, бинарный, режим) — весь файл.
function assignedLines(hunks, reviewed) {
  const byId = new Map(hunks.map((h) => [h.id, h]));
  const out = {};
  for (const { axis, hunks: ids } of reviewed) {
    const lines = (out[axis] ??= {});
    for (const h of ids.map((id) => byId.get(id)).filter(Boolean)) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(h.at);
      (lines[h.file] ??= []).push(m ? [Number(m[1]), Number(m[2] ?? m[1])] : [1, Infinity]);
    }
  }
  return out;
}

function applyStatuses(next, wave, outputs) {
  const closed = [];
  for (const out of outputs)
    for (const s of out.statuses) {
      const f = next.findings.find((g) => g.id === s.id);
      f.status = s.status;
      f.history.push({ wave, status: s.status, note: s.note ?? "" });
      if (s.status === "closed" || s.status === "dispute-accepted") closed.push(f.id);
    }
  return closed;
}

// Вердикты после круга: прежние — у hunk'ов, которые есть на head; новые — оси за каждый hunk её brief'а, если он
// на head тот же. reviewed — [{axis, hunks: [id]}]. Hunk, которого коснулась правка, получил новый id, и вердикта у него нет.
function reviewedAfter(state, hunks, reviewed) {
  const current = new Set(hunks.map((h) => h.id));
  const reviewedBy = Object.fromEntries(Object.entries(state.reviewedBy ?? {}).filter(([id]) => current.has(id)));
  for (const { axis, hunks: ids } of reviewed)
    for (const id of ids) if (current.has(id) && !isReviewed(reviewedBy, id, axis)) reviewedBy[id] = [...(reviewedBy[id] ?? ""), LETTER[axis]].sort().join("");
  return reviewedBy;
}

// Выходы агентов круга (уже проверенные) → новое состояние. changed — строки дельты (scope.changedLines);
// reviewed — hunk'и, которые оси получили в brief'ах круга. Находка late — вне строк дельты и вне hunk'ов своей оси.
export function mergeWave(state, { wave, scope, outputs, changed, reviewed = [] }) {
  const next = structuredClone(state);
  const mode = scope.mode ?? "review";
  const warnings = [];
  const closed = applyStatuses(next, wave, outputs);
  const assigned = assignedLines(scope.hunks ?? [], reviewed);
  const found = [];
  for (const out of outputs) {
    let n = 0;
    for (const f of out.findings) {
      if (isDuplicate(next, f)) {
        warnings.push(`повтор открытой находки: ${f.where} ${f.rule}`);
        continue;
      }
      const id = `W${wave}-${LETTER[out.axis]}${++n}`;
      const late = wave > 1 && mode !== "conflicts" && !inChanged(changed, f.where) && !inChanged(assigned[out.axis] ?? {}, f.where);
      next.findings.push({ ...f, id, late, wave, status: f.severity === "block" ? "open" : "advice", history: [] });
      found.push(id);
    }
  }
  // Число разных hunk'ов круга: hunk, который смотрели две оси, считается один раз.
  const hunks = new Set(reviewed.flatMap((r) => r.hunks)).size;
  next.waves.push({ n: wave, mode, axes: outputs.map((o) => o.axis), base: scope.base, head: scope.head, hunks, found, closed });
  Object.assign(next, { wave, head: scope.head, base: scope.base, answers: null, decisions: [] });
  next.triggers ??= scope.triggers;
  if (mode === "conflicts") next.budget += 1;
  else {
    next.reviewedBy = reviewedAfter(state, scope.hunks ?? [], reviewed);
    next.unreviewed = countUnreviewed(scope.hunks ?? [], next.reviewedBy);
  }
  const decided = decide(next);
  // Круг по hunk'ам без вердикта на том же head — след исправления красных ворот, а на них круг не тратится.
  if (decided.next === "wave") next.budget += 1;
  return { state: next, warnings, ...decided };
}

// Решение по кругу: stop | fix (решения владельца) | escalate | wave (hunk'и без вердикта) | tidy | done | fix —
// по порядку правил. tidy — только после круга без блокирующих находок: советы круга с блокирующими решает answer.
export function decide(state) {
  const open = openFindings(state);
  if (state.stopped) return { next: "stop", why: "владелец остановил цикл" };
  if (state.decisions.length) return { next: "fix", why: "решения владельца к исполнению" };
  if (open.some((f) => f.status === "dispute-kept")) return { next: "escalate", why: "автор и ревьюер расходятся в правиле" };
  if (!open.some((f) => !f.late)) {
    if (state.unreviewed > 0) return { next: "wave", why: `hunk'ов без вердикта на head: ${state.unreviewed}` };
    const loose = looseFindings(state).length;
    if (loose && !state.tidied) return { next: "tidy", why: `хвостов перед сдачей: ${loose} — исправить, отложить в план или отклонить` };
    return { next: "done", why: "блокирующих находок нет" };
  }
  if (state.wave >= state.budget) return { next: "escalate", why: `бюджет ${state.budget} кругов исчерпан` };
  return { next: "fix", why: `открыто блокирующих: ${open.length}` };
}

// Ответ исправляющего (answer или tidy) → состояние. Советы и отложенное получают итоговый статус сразу;
// исправленные блокирующие находки закрывает следующий круг. answer решает и советы своего круга (S0-45).
// owner — ответ на находки, которые назвало поручение владельца: ответы, которые круг ещё не проверил, остаются.
export function recordAnswer(state, out, job) {
  const next = structuredClone(rememberMutants(state, out, "fixer"));
  const items = out.answers ?? [];
  const prior = job === "owner" && state.answers ? state.answers : null;
  const kept = (prior?.items ?? []).filter((a) => !items.some((b) => b.id === a.id));
  next.answers = { wave: state.wave, job: prior?.job ?? job, head: out.head, items: [...kept, ...items] };
  for (const a of next.answers.items) {
    const f = next.findings.find((g) => g.id === a.id);
    if (!f) continue;
    if (a.action === "deferred") Object.assign(f, { status: "deferred", deferredTo: a.where });
    else if (a.action === "declined") Object.assign(f, { status: "declined", declinedWhy: a.note });
    else if (a.action === "fixed" && f.status === "advice") f.status = "applied";
  }
  if (job === "tidy") Object.assign(next, { tidied: true, budget: next.budget + 1 });
  next.gaps = rememberGaps(next, out).gaps;
  next.decisions = [];
  next.owner = null;
  return next;
}

// Находки, по которым нужен владелец: спор или открытые после бюджета.
export function escalated(state) {
  const open = openFindings(state);
  return open.some((f) => f.status === "dispute-kept") ? open.filter((f) => f.status === "dispute-kept") : open.filter((f) => !f.late);
}

// Вопрос владельцу: по находкам, вопрос агента или общий — по причине why.
export function ask(state, { why, question, agent, job }) {
  const next = structuredClone(state);
  const items = question ? [] : escalated(state);
  next.pending = items.length && !agent ? { why, findings: items.map((f) => f.id) } : { why, agent: agent ?? null, job: job ?? null, question: question ?? { text: why, options: ["продолжить", "стоп"], recommendation: "продолжить" } };
  return next;
}

// Ответ владельца по находкам {id: {action, note}} → ошибки или новое состояние.
export function answerFindings(state, answers) {
  const errors = [];
  const asked = new Set(state.pending?.findings ?? []);
  for (const [id, a] of Object.entries(answers)) {
    if (!asked.has(id)) errors.push(`${id}: владельца об этой находке не спрашивали`);
    if (!OWNER_ACTIONS.includes(a?.action)) errors.push(`${id}.action: ${OWNER_ACTIONS.join(" | ")}`);
  }
  for (const id of asked) if (!(id in answers)) errors.push(`${id}: нет решения`);
  if (errors.length) return { errors };
  const next = structuredClone(state);
  for (const [id, { action, note = "" }] of Object.entries(answers)) {
    const f = next.findings.find((g) => g.id === id);
    if (action === "stop") next.stopped = true;
    else f.status = action === "fix" ? "open" : "owner-closed";
    f.history.push({ wave: next.wave, status: `owner:${action}`, note });
    if (["fix", "task", "gap"].includes(action)) next.decisions.push({ id, action, note });
  }
  next.budget += 1;
  next.pending = null;
  return { errors, state: next, ...decide(next) };
}

// Ответ владельца текстом: стоп, ответ агенту, который спрашивал, или поручение исправляющему.
// Остановленный цикл ответ владельца возобновляет: «продолжить» — к воротам и следующему кругу, а если ворота на head
// уже зелёные, — сразу к кругу (S0-43); иной текст — поручение.
export function answerText(state, text) {
  if (!state.pending && !state.stopped) return { errors: ["владельца ни о чём не спрашивали"] };
  const next = structuredClone(state);
  const agent = state.pending?.agent;
  next.pending = null;
  if (/^\s*стоп\s*$/i.test(text)) {
    next.stopped = true;
    return { errors: [], state: next, next: "stop", why: "владелец остановил цикл" };
  }
  next.stopped = false;
  if (state.stopped && /^\s*продолжить\s*$/i.test(text)) {
    const green = greenHead(state.steps ?? []);
    return { errors: [], state: next, next: green ? "wave" : "gate", why: green ? `владелец возобновил цикл; ворота на head ${green.slice(0, 7)} зелёные` : "владелец возобновил цикл" };
  }
  next.owner = agent ? { text, agent, job: state.pending.job } : { text, agent: "fixer", job: "owner" };
  return { errors: [], state: next, ...resumeOf(next) };
}

const resumeOf = (state) => (state.owner.job === "owner" ? { next: "instruct", why: "поручение владельца" } : { next: "resume", agent: state.owner.agent, job: state.owner.job, why: "ответ владельца агенту" });

// Куда идти после комментария вида kind — для продолжения в новой сессии.
export function entryOf(kind, state) {
  if (kind === "final") return { next: "end", why: "цикл завершён" };
  if (state.stopped) return { next: "stop", why: "владелец остановил цикл" };
  if (kind === "escalation" || state.pending) return { next: "ask", why: state.pending?.why };
  if (state.owner) return resumeOf(state);
  if (kind === "answer") return { next: "gate", why: "ответ на ревью опубликован" };
  // Решение владельца без поручения после ответа, который круг ещё не ревьюировал, — возобновлённый цикл.
  if (kind === "decision" && !state.decisions.length && state.answers && state.answers.head !== state.head) return { next: "gate", why: "владелец возобновил цикл" };
  return decide(state);
}
