// state: состояние цикла и его переходы (plan/dev-loop.md, «Круги»). Чистые функции.
// Состояние: {pr, task, branch, budget, wave, head, base, waves[], findings[], answers, decisions[], gaps[], triggers,
//   pending — вопрос владельцу {why, question?, agent?, findings?}, owner — ответ владельца агенту {text, agent, job?}, stopped}.
// Находка: {id, axis, severity, rule, where, quote, text, ratchet, late, wave, status, history[{wave, status, note}]}.
import { LETTER } from "./protocol.mjs";

export const BUDGET = 3;
export const OWNER_ACTIONS = ["fix", "drop", "task", "gap", "stop"];
const DUPLICATE_LINES = 3;

export function initial({ pr, task, branch, gaps = [] }) {
  return { pr, task, branch, budget: BUDGET, wave: 0, head: null, base: null, waves: [], findings: [], answers: null, decisions: [], gaps, triggers: null, pending: null, owner: null, stopped: false };
}

const isOpen = (f) => f.severity === "block" && (f.status === "open" || f.status === "dispute-kept");
export const openFindings = (state) => state.findings.filter(isOpen);
const disputedIds = (state) => (state.answers?.items ?? []).filter((a) => a.action === "disputed").map((a) => a.id);
// Что должен закрыть исправляющий: открытые находки и решения владельца task и gap.
export const toAnswer = (state) => [...openFindings(state).map((f) => f.id), ...state.decisions.filter((d) => d.action !== "fix").map((d) => d.id)];

// Кто ставит статус каждой открытой находке и какие агенты нужны кругу.
export function planWave(state, scope) {
  const wave = state.wave + 1;
  const open = openFindings(state);
  const disputed = disputedIds(state);
  const axes = new Set(scope.axes);
  for (const f of open) if (disputed.includes(f.id) && f.axis !== "verify") axes.add(f.axis);
  const job = wave === 1 ? "full" : "delta";
  const agents = [...axes].map((axis) => ({ agent: `reviewer-${axis}`, axis, job, findings: open.filter((f) => f.axis === axis) }));
  const rest = open.filter((f) => !axes.has(f.axis));
  if (rest.length || (scope.mode === "verify" && scope.lines > 0)) agents.push({ agent: "verifier", axis: "verify", job: scope.mode === "verify" ? "close" : "status", findings: rest });
  return { wave, mode: scope.mode, agents, disputed };
}

function isDuplicate(state, f) {
  const [file, line] = f.where.split(":");
  return state.findings.some((g) => isOpen(g) && g.rule === f.rule && g.where.split(":")[0] === file && Math.abs(Number(g.where.split(":")[1]) - Number(line)) <= DUPLICATE_LINES);
}

const inChanged = (changed, where) => {
  const [file, line] = where.split(":");
  return (changed[file] ?? []).some(([from, to]) => Number(line) >= from && Number(line) <= to);
};

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

// Выходы агентов круга (уже проверенные) → новое состояние. changed — строки дельты (scope.changedLines).
export function mergeWave(state, { wave, scope, outputs, changed }) {
  const next = structuredClone(state);
  const warnings = [];
  const closed = applyStatuses(next, wave, outputs);
  const found = [];
  for (const out of outputs) {
    let n = 0;
    for (const f of out.findings) {
      if (isDuplicate(next, f)) {
        warnings.push(`повтор открытой находки: ${f.where} ${f.rule}`);
        continue;
      }
      const id = `W${wave}-${LETTER[out.axis]}${++n}`;
      const late = wave > 1 && scope.mode !== "conflicts" && !inChanged(changed, f.where);
      next.findings.push({ ...f, id, late, wave, status: f.severity === "block" ? "open" : "advice", history: [] });
      found.push(id);
    }
  }
  next.waves.push({ n: wave, mode: scope.mode, axes: outputs.map((o) => o.axis), base: scope.base, head: scope.head, found, closed });
  Object.assign(next, { wave, head: scope.head, base: scope.base, answers: null, decisions: [] });
  next.triggers ??= scope.triggers;
  if (scope.mode === "conflicts") next.budget += 1;
  return { state: next, warnings, ...decide(next) };
}

// Решение по кругу: stop | fix (решения владельца) | escalate | done | fix — по порядку правил.
export function decide(state) {
  const open = openFindings(state);
  if (state.stopped) return { next: "stop", why: "владелец остановил цикл" };
  if (state.decisions.length) return { next: "fix", why: "решения владельца к исполнению" };
  if (open.some((f) => f.status === "dispute-kept")) return { next: "escalate", why: "автор и ревьюер расходятся в правиле" };
  if (!open.some((f) => !f.late)) return { next: "done", why: "блокирующих находок нет" };
  if (state.wave >= state.budget) return { next: "escalate", why: `бюджет ${state.budget} кругов исчерпан` };
  return { next: "fix", why: `открыто блокирующих: ${open.length}` };
}

export function recordAnswer(state, out) {
  const next = structuredClone(state);
  next.answers = { wave: state.wave, head: out.head, items: out.answers ?? [], advice: out.advice ?? [] };
  for (const a of next.answers.advice) if (a.applied) next.findings.find((f) => f.id === a.id).status = "applied";
  next.gaps = [...new Set([...next.gaps, ...(out.gaps ?? [])])];
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
export function answerText(state, text) {
  if (!state.pending) return { errors: ["владельца ни о чём не спрашивали"] };
  const next = structuredClone(state);
  const agent = state.pending.agent;
  next.pending = null;
  if (/^\s*стоп\s*$/i.test(text)) {
    next.stopped = true;
    return { errors: [], state: next, next: "stop", why: "владелец остановил цикл" };
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
  return decide(state);
}
