// clock: шаги цикла и их время (S0-46; PLAN.md фазы S0, раздел 8, «замер»). Чистые функции: время приходит параметром.
// Шаг: {kind, role, job, wave, head, start, end, briefs?, green?, reason?}; end null — шаг идёт.
//   agent  — executor или fixer: от dl brief до dl check или dl answer; briefs — {имя brief: байт};
//   gate   — dl gate: prove --gate (S0-43); green — его исход; shadow, taken и ran — режим, test-sets из записей и
//            прогнанные; mismatches — расхождения shadow с записями; red — {set, key} красных test-sets;
//   review — круг: от dl wave до dl merge; role reviewer; reason — почему круг; briefs — brief'ы ревьюеров;
//   owner  — от dl escalate до dl owner.
// Время — ISO-строки UTC: их порядок — порядок строк.

// Причина круга: первый; ответ на блокирующие находки — и после решения владельца по ним (fix, task, gap):
// исправляющий отвечает на них заданием answer; хвосты tidy; поручение владельца (задание owner) или цикл,
// возобновлённый владельцем после стопа; пересборка на main.
const REASONS = ["first", "block", "tidy", "owner", "rebase"];

const same = (a, b) => a.kind === b.kind && a.role === b.role && a.job === b.job;

// Начало шага. Шаг того же вида, роли и задания уже идёт — он и остаётся: повторный brief не сдвигает начало.
export function begin(steps, step, at) {
  if (steps.some((s) => s.end === null && same(s, step))) return steps;
  return [...steps, { head: null, ...step, start: at, end: null }];
}

// Конец последнего идущего шага вида, роли и задания match; extra — что стало известно к концу (head, green).
export function finish(steps, match, at, extra = {}) {
  const i = steps.findLastIndex((s) => s.end === null && same(s, { role: null, job: null, ...match }));
  return i < 0 ? steps : steps.map((s, j) => (j === i ? { ...s, ...extra, end: at } : s));
}

// Почему идёт круг wave: по состоянию до него. Ответ исправляющего записан в state.answers до следующего merge.
export function reasonOf(state, { rebased }) {
  if (rebased) return "rebase";
  if (state.wave === 0) return "first";
  if (state.answers?.job === "tidy") return "tidy";
  if (state.answers?.job === "answer") return "block";
  return "owner";
}

// Head, на котором последние ворота зелёные, если с тех пор ни один шаг не назвал другой head (S0-43); иначе null.
export function greenHead(steps) {
  const i = steps.findLastIndex((s) => s.kind === "gate");
  if (i < 0 || !steps[i].green) return null;
  const { head } = steps[i];
  return steps.slice(i + 1).every((s) => s.head === null || s.head === undefined || s.head === head) ? head : null;
}

// Красных ворот подряд в конце цикла.
export function redsInRow(steps) {
  let n = 0;
  for (const s of steps.toReversed()) {
    if (s.kind !== "gate") continue;
    if (s.green) break;
    n += 1;
  }
  return n;
}

const ms = (s) => Date.parse(s.end) - Date.parse(s.start);
const sum = (list) => list.reduce((a, s) => a + ms(s), 0);

// Категории итога: executor, ворота, круги по причинам, fixer, владелец.
const CATEGORIES = [
  { key: "executor", of: (s) => s.kind === "agent" && s.role === "executor" },
  { key: "gate", of: (s) => s.kind === "gate" },
  ...REASONS.map((r) => ({ key: `review:${r}`, of: (s) => s.kind === "review" && s.reason === r })),
  { key: "fixer", of: (s) => s.kind === "agent" && s.role === "fixer" },
  { key: "owner", of: (s) => s.kind === "owner" },
];

function briefsOf(steps) {
  const by = new Map();
  for (const s of steps)
    for (const [name, bytes] of Object.entries(s.briefs ?? {})) {
      const b = by.get(name) ?? { name, count: 0, max: 0, total: 0 };
      by.set(name, { name, count: b.count + 1, max: Math.max(b.max, bytes), total: b.total + bytes });
    }
  return [...by.values()];
}

// Замер цикла к моменту at: путь шагов по порядку, итоги по категориям, весь цикл и время вне шагов, brief'ы.
// Цикл последовательный — шаги идут один за другим, — поэтому его критический путь — все закрытые шаги.
export function measure(steps, at) {
  const done = steps.filter((s) => s.end !== null);
  const first = steps.map((s) => s.start).sort()[0];
  const span = first === undefined ? 0 : Date.parse(at) - Date.parse(first);
  const rows = CATEGORIES.map(({ key, of }) => {
    const list = done.filter(of);
    return { key, count: list.length, ms: sum(list), reds: key === "gate" ? list.filter((s) => !s.green).length : undefined };
  });
  return { path: done.map((s) => ({ step: s, ms: ms(s) })), rows, span, inSteps: sum(done), running: steps.length - done.length, briefs: briefsOf(steps) };
}
