// render: комментарии цикла в PR по шаблонам (plan/dev-loop.md, «Обмен»). Чистые функции.
// Первая строка каждого комментария — заголовок <!-- dev-loop {kind, state} --> с состоянием после события.
import { measure } from "./clock.mjs";
import { openFindings } from "./state.mjs";

const AXIS = { spec: "Spec", standards: "Standards", architecture: "Architecture", verify: "Проверка ответов" };
const STATUS = { closed: "закрыта", open: "открыта", "dispute-accepted": "спор принят", "dispute-kept": "спор отклонён" };
const MODE = { review: "ревью hunk'ов", conflicts: "проверка конфликтов пересборки" };
const NEXT = { fix: "исправления", tidy: "хвосты перед сдачей", done: "сдача", escalate: "решение владельца", wave: "круг по hunk'ам без вердикта" };
export const OWNER_OPTIONS = [
  { label: "чинить", action: "fix", description: "исправить по находке; как — можно дописать через Other" },
  { label: "снять", action: "drop", description: "находка закрыта решением владельца" },
  { label: "в задачу", action: "task", description: "работа уходит в новую задачу плана" },
  { label: "стоп", action: "stop", description: "цикл останавливается, PR остаётся draft" },
];
const short = (sha) => (sha ?? "").slice(0, 7);
const cell = (text) => String(text ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const title = (state, what) => `## ${what} · PR #${state.pr}${state.task ? ` (${state.task})` : ""}`;
const lines = (out) => out.join("\n") + "\n";

// Закрытые находки в заголовке — без текста: комментарий не растёт с каждым кругом.
const LIVE = ["open", "dispute-kept", "advice", "deferred", "declined"];
const ACTION = { fixed: "исправлено", disputed: "оспорено", deferred: "отложено в план", declined: "отклонено" };
const compact = (f) => (LIVE.includes(f.status) ? f : { id: f.id, axis: f.axis, severity: f.severity, rule: f.rule, where: f.where, status: f.status, late: f.late, wave: f.wave, ratchet: f.ratchet, history: [] });

export function header(kind, state) {
  const json = JSON.stringify({ kind, state: { ...state, findings: state.findings.map(compact) } });
  return `<!-- dev-loop ${json.replaceAll("--", "-\\u002d")} -->`;
}

export function parseHeader(body) {
  const m = /^<!-- dev-loop (\{.*\}) -->/.exec(body ?? "");
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

function findingBlock(f) {
  const tag = f.severity === "block" ? "блокирует" : "совет";
  const late = f.late ? " · вне дельты" : "";
  const quote = f.quote ? `\n> ${f.quote.split("\n").join("\n> ")}` : "";
  return `**${f.id}** · ${tag} · ${f.rule || "—"} · \`${f.where}\`${late}${quote}\n${f.text}`;
}

export function review(state, { scope, outputs, next }) {
  const wave = state.waves.at(-1);
  const out = [header("review", state), title(state, `Ревью · круг ${wave.n}`), ""];
  const what = wave.mode === "conflicts" ? MODE.conflicts : `${MODE.review}: ${wave.hunks ?? 0}`;
  out.push(`Head \`${short(wave.head)}\` · база \`${short(wave.base)}\` · ${what} · оси: ${outputs.map((o) => AXIS[o.axis]).join(", ") || "нет"}`);
  for (const [axis, why] of Object.entries(scope.reasons ?? {})) if (why.length) out.push(`- ${AXIS[axis]}: ${why.join("; ")}`);
  for (const o of outputs) {
    out.push("", `### ${AXIS[o.axis]}`, "", o.summary);
    if (o.statuses.length) {
      out.push("", "| Находка | Статус | Заметка |", "|---|---|---|");
      for (const s of o.statuses) out.push(`| ${s.id} | ${STATUS[s.status]} | ${cell(s.note)} |`);
    }
    for (const f of state.findings.filter((g) => g.wave === wave.n && g.axis === o.axis)) out.push("", findingBlock(f));
  }
  const open = openFindings(state).map((f) => f.id + (f.late ? " (вне дельты)" : ""));
  out.push("", "### Итог", "", `Блокирует: ${open.join(", ") || "ничего"}. Дальше: ${NEXT[next] ?? next}.`);
  return lines(out);
}

export function answer(state) {
  const a = state.answers;
  const out = [header("answer", state), title(state, `Ответ на ревью · круг ${a.wave}`), "", `Head \`${short(a.head)}\` · \`npm run verify\` зелёный`, ""];
  out.push("| Находка | Ответ | Коммиты или запись |", "|---|---|---|");
  for (const x of a.items) out.push(`| ${x.id} | ${ACTION[x.action]}: ${cell(x.note)} | ${x.where ? `\`${x.where}\`` : (x.commits ?? []).map(short).join(", ")} |`);
  if (state.gaps.length) out.push("", `Пробелы для решения владельца до merge: ${state.gaps.join(", ")}.`);
  return lines(out);
}

function history(f) {
  return [`W${f.wave} найдена`, ...f.history.map((h) => `W${h.wave} ${STATUS[h.status] ?? h.status}${h.note ? `: ${h.note}` : ""}`)].join(" → ");
}

// Вопросы владельцу для AskUserQuestion — из state.pending.
export function questions(state) {
  const p = state.pending;
  if (!p) return [];
  if (p.question)
    return [{ question: p.question.text, header: "Решение", multiSelect: false, options: p.question.options.map((o) => ({ label: o.slice(0, 60), description: o === p.question.recommendation ? "рекомендация" : o })) }];
  return p.findings.slice(0, 4).map((id) => {
    const f = state.findings.find((g) => g.id === id);
    return { question: `${f.id} · ${f.rule} · ${f.where}: ${f.text}`, header: f.id, multiSelect: false, options: OWNER_OPTIONS.map(({ label, description }) => ({ label, description })) };
  });
}

export function escalation(state) {
  const p = state.pending;
  const out = [header("escalation", state), title(state, "Нужно решение владельца"), "", `Причина: ${p.why}.`];
  if (p.question) out.push("", p.question.text, "", ...p.question.options.map((o) => `- ${o}`), "", `Рекомендация: ${p.question.recommendation}`);
  for (const id of p.findings ?? []) {
    const f = state.findings.find((g) => g.id === id);
    out.push("", `### ${f.id} · ${f.rule} · \`${f.where}\``, "", f.text, "", `История: ${history(f)}`);
  }
  if (p.findings) out.push("", `Варианты по каждой находке: ${OWNER_OPTIONS.map((o) => o.label).join(" · ")} · G-NN (пробел в PLAN.md).`);
  return lines(out);
}

export function decision(state, { answers, text }) {
  const out = [header("decision", state), title(state, "Решение владельца"), ""];
  if (text) out.push(text);
  else {
    out.push("| Находка | Решение | Как |", "|---|---|---|");
    for (const [id, { action, note }] of Object.entries(answers)) out.push(`| ${id} | ${action} | ${cell(note)} |`);
    out.push("", `Бюджет кругов: ${state.budget}.`);
  }
  return lines(out);
}

function audit(t) {
  if (!t) return [];
  return [...t.skeleton.map((p) => `skeleton \`${p}\``), ...t.newModules.map((m) => `новый модуль ${m}`), ...t.newPorts.map((p) => `новый порт \`${p}\``), ...(t.modules.length ? [`модулей: ${t.modules.join(", ")}`] : [])];
}

const minutes = (ms) => (ms / 60000).toFixed(1);
const CATEGORY = {
  executor: "executor", gate: "ворота", "review:first": "круги: первый", "review:block": "круги: блокирующие", "review:tidy": "круги: tidy",
  "review:owner": "круги: владелец", "review:rebase": "круги: rebase", fixer: "fixer", owner: "владелец",
};
const stepName = (s) => {
  if (s.kind === "agent") return s.job ? `${s.role} ${s.job}` : s.role;
  return { gate: "ворота", review: `круг ${s.wave}`, owner: "владелец" }[s.kind];
};

// Замер цикла (S0-46): критический путь, итоги по категориям — круги по причинам, — время вне шагов, размеры brief'ов.
function measured(steps, at) {
  if (!steps.length) return [];
  const m = measure(steps, at);
  const out = ["", "### Замер", "", `Критический путь, мин: ${m.path.map(({ step, ms }) => `${stepName(step)} ${minutes(ms)}`).join(" → ") || "—"}.`];
  out.push(`Весь цикл ${minutes(m.span)} мин: в шагах ${minutes(m.inSteps)}, вне шагов ${minutes(m.span - m.inSteps)}.${m.running ? ` Не закрыто шагов: ${m.running}.` : ""}`);
  out.push("", "| Шаг | Число | Мин |", "|---|---|---|");
  for (const r of m.rows) out.push(`| ${CATEGORY[r.key]} | ${r.count}${r.reds === undefined ? "" : `, красных ${r.reds}`} | ${minutes(r.ms)} |`);
  if (m.briefs.length) out.push("", "| Brief | Число | Байт, наибольший | Байт, всего |", "|---|---|---|---|", ...m.briefs.map((b) => `| ${b.name} | ${b.count} | ${b.max} | ${b.total} |`));
  return out;
}

// at — время итога: конец цикла для замера.
// Изменённые пункты и строки CONVENTIONS.md из main (scope.mjs, conventionsChanged). До CONVENTIONS_LISTED — по одному
// в строке; больше — номера пунктов одной строкой и число строк: перестройку файла владелец решает целиком.
const CONVENTIONS_LISTED = 10;

function conventionsTodo(changed) {
  const items = changed.filter((c) => c.id !== undefined);
  const rows = changed.filter((c) => c.line !== undefined).map((c) => c.line);
  const out = [];
  if (items.length <= CONVENTIONS_LISTED)
    out.push(...items.map((i) => `- пункт CONVENTIONS.md ${i.id} «${i.title}» из main ${i.gone ? "убран" : "изменён"}`));
  else
    for (const [gone, what] of [[false, "изменены"], [true, "убраны"]]) {
      const ids = items.filter((i) => i.gone === gone).map((i) => i.id);
      if (ids.length) out.push(`- пункты CONVENTIONS.md из main ${what} (${ids.length}): ${ids.join(", ")}`);
    }
  if (rows.length <= CONVENTIONS_LISTED)
    out.push(...rows.map((l) => `- строка CONVENTIONS.md из main изменена или убрана: «${l.length > 200 ? `${l.slice(0, 200)}…` : l}»`));
  else out.push(`- строк CONVENTIONS.md из main изменено или убрано: ${rows.length} — перестройка файла; список — \`git diff origin/main...HEAD -- CONVENTIONS.md\``);
  return out;
}

// Контекст агентов (S0-48): что агенты прочитали сверх brief'а, и размер brief'ов в токенах по оценке — байт на 4,
// как считает бюджет brief'а (context.mjs).
function contextOf(context, steps) {
  const out = ["", "### Контекст агентов", "", ...(context.length ? context.map((c) => `- ${c.agent}: ${c.text}`) : ["Сверх brief'ов агенты ничего не читали."])];
  const sizes = new Map();
  for (const s of steps) for (const [name, bytes] of Object.entries(s.briefs ?? {})) sizes.set(name, [...(sizes.get(name) ?? []), Math.ceil(bytes / 4)]);
  if (sizes.size)
    out.push("", "| Brief агента | Токенов, наибольший | Токенов, всего |", "|---|---|---|", ...[...sizes].map(([name, t]) => `| ${name} | ${Math.max(...t)} | ${t.reduce((a, b) => a + b, 0)} |`));
  return out;
}

export function final(state, { scope, conventions = [], context = [], at } = {}) {
  const out = [header("final", state), title(state, "Итог цикла"), ""];
  out.push(`Head \`${short(state.head ?? scope?.head)}\` · \`npm run verify\` зелёный · кругов: ${state.waves.length} из ${state.budget}`);
  if (!state.waves.length && scope) out.push("", `Ревью не требовался: изменения вне кода (${scope.lines} строк).`);
  if (state.waves.length) {
    out.push("", "| Круг | Режим | Hunk'ов | Оси | Найдено | Закрыто |", "|---|---|---|---|---|---|");
    for (const w of state.waves) out.push(`| ${w.n} | ${MODE[w.mode] ?? w.mode} | ${w.hunks ?? "—"} | ${w.axes.map((a) => AXIS[a]).join(", ")} | ${w.found.join(", ") || "—"} | ${w.closed.join(", ") || "—"} |`);
  }
  const of = (status) => state.findings.filter((f) => f.status === status);
  const deferred = of("deferred").map((f) => `- ${f.id} · \`${f.where}\`: ${f.text} → \`${f.deferredTo}\``);
  const declined = of("declined").map((f) => `- ${f.id} · \`${f.where}\`: ${f.text} — ${f.declinedWhy}`);
  if (deferred.length) out.push("", "### Отложено в план", "", ...deferred);
  if (declined.length) out.push("", "### Отклонённые советы", "", ...declined);
  const todo = [
    ...openFindings(state).filter((f) => f.late).map((f) => `- находка вне дельты ${f.id} · ${f.rule} · \`${f.where}\`: ${f.text}`),
    ...of("advice").map((f) => `- совет ${f.id} · \`${f.where}\`: ${f.text}`),
    ...state.gaps.map((g) => `- пробел ${g} в PLAN.md: решение до merge`),
    ...conventionsTodo(conventions),
  ];
  out.push("", "### Решить владельцу до merge", "", ...(todo.length ? todo : ["нечего"]));
  const ratchet = state.findings.filter((f) => f.ratchet).map((f) => f.id);
  out.push("", `Триггеры аудита ST-15: ${audit(state.triggers ?? scope?.triggers).join("; ") || "нет"}.`, `Кандидаты в ratchet (ST-16): ${ratchet.join(", ") || "нет"}.`);
  out.push(...contextOf(context, state.steps ?? []));
  out.push(...measured(state.steps ?? [], at));
  return lines(out);
}
