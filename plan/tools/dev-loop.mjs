#!/usr/bin/env node
// dev-loop: инструмент оркестратора /dev-loop (plan/dev-loop.md). Каждая команда печатает одну строку JSON.
//   scope <base> [<head>] [--since <ref>]                   hunk'и ветки и оси, чьи триггеры они задевают
//   start (--task T | --pr N) [--root R]                      старт или продолжение: копия на main, worktree, npm ci, PR задачи —
//                                                             у новой задачи ветка, коммит «T: start» и draft PR (S0-51), следующий шаг
//   brief executor --dir D --task T --worktree W [--owner текст]   brief в бюджете: данные задачи (context.mjs, S0-48)
//   step selfcheck|pr|deviation|where [--worktree W] [--task T]       материал шага агента: самопроверка по diff ветки
//                                                             или раздел plan-task как есть
//   init --dir D --task T (--from executor.out.json | --pr N --branch B)
//   ready --dir D --worktree W --from executor.out.json       сдача (шаг 6 plan-task): пункты done → [x], доска, фаза, plan-check, push, PR ready
//   gate --dir D --worktree W                                 ворота: verify на запушенном head в D/verify.log, следующий шаг
//   wave --dir D --worktree W [--early | --conflicts a,b]     следующий круг: briefs агентов; --early — оси, которые стартуют
//                                                             вместе с воротами; без него — остальные агенты того же круга
//   check <файл.out.json> [--dir D]                           выход агента против его brief; с --dir — конец шага агента
//   merge --dir D                                             итоги круга → состояние, отчёт
//   brief fixer --dir D --worktree W --job answer|tidy|verify-red|rebase|owner [--log P] [--owner текст]
//   answer --dir D [--job tidy]                               ответ исправляющего → состояние, комментарий
//   escalate --dir D --why текст [--from файл.out.json]       вопрос владельцу: комментарий и questions
//   owner --dir D (--answers файл.json | --text текст)        решение владельца → состояние, комментарий
//   final --dir D --worktree W                                итоговый комментарий
//   restore --dir D --comments файл.json                      состояние из `gh pr view --json comments` (отладка; start делает сам)
// Файлы цикла в D: state.json, waves/<n>/<агент>.in.json и .out.json, waves/<n>/scope.json, waves/<n>/diff.patch, comments/<NN>-<вид>.md,
//   verify.log — лог последних ворот, steps.json — шаги до init (init переносит их в состояние).
// Время шагов (clock.mjs) — сейчас или DEV_LOOP_NOW (ISO), если задано: так тесты не ждут.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { begin, finish, reasonOf, redsInRow } from "./dev-loop/clock.mjs";
import { contextMissing, diffOf, executorBrief as executorContext, fixerBrief as fixerContext, reviewerBrief as reviewerContext, selfcheck, STEPS, stepText } from "./dev-loop/context.mjs";
import { check, FIXER_JOBS } from "./dev-loop/protocol.mjs";
import { answer, decision, escalation, final, parseHeader, questions, review } from "./dev-loop/render.mjs";
import { changedLines, conventionsChanged, scope } from "./dev-loop/scope.mjs";
import { answerFindings, answerText, ask, entryOf, initial, looseFindings, mergeWave, openFindings, planWave, recordAnswer, rememberMutants } from "./dev-loop/state.mjs";
import { advancePhase, closeOnBoard, findTask, itemsOf, markItems } from "./dev-loop/task.mjs";

const COMMENT_MAX = 65000;
const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--early") flags.early = true;
  else if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[++i];
  else positional.push(rest[i]);
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, v) => writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 2) + "\n");
const print = (v) => console.log(JSON.stringify(v));
const fail = (error) => {
  print({ ok: false, error });
  process.exit(1);
};
const need = (name) => flags[name] ?? fail(`нужен --${name}`);
const dir = () => need("dir");
const statePath = () => join(dir(), "state.json");
const load = () => (existsSync(statePath()) ? read(statePath()) : fail(`нет ${statePath()}: сначала init или restore`));
const save = (state) => write(statePath(), state);
const waveDir = (n) => {
  const p = join(dir(), "waves", String(n));
  mkdirSync(p, { recursive: true });
  return p;
};
const now = () => process.env.DEV_LOOP_NOW ?? new Date().toISOString();
const stepsPath = () => join(dir(), "steps.json");
const stepsOf = (state) => state.steps ?? [];
// Шаги цикла меняет change: в состоянии, а до init — в steps.json. Без --dir (отладка) шаги не пишутся.
function stamp(change) {
  if (flags.dir === undefined) return;
  const state = existsSync(statePath()) ? read(statePath()) : null;
  if (state) return save({ ...state, steps: change(stepsOf(state)) });
  mkdirSync(dir(), { recursive: true });
  write(stepsPath(), change(existsSync(stepsPath()) ? read(stepsPath()) : []));
}
const git = (worktree, ...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// Мутанты изменённых hunk'ов src/ (S0-44) — для выхода автора: scripts/mutants.mjs грузит typescript, и другим командам он не нужен.
const mutantsAt = async (worktree) => (await import("../../scripts/mutants.mjs")).changedMutants({ dir: worktree, base: "origin/main" }).mutants;
const reportOf = (worktree) => {
  const file = join(worktree, ".lattice", "mutants.json");
  return existsSync(file) ? read(file) : null;
};
// mutation — {mutants, decided}: мутанты на head и решения, которые dl помнит; без них — ни мутантов, ни решений.
const repoOf = (worktree, task, mutation = { mutants: [], decided: {} }) => ({
  since: () => git(worktree, "merge-base", "origin/main", "HEAD"),
  mutants: () => mutation.mutants,
  report: () => reportOf(worktree),
  decided: () => mutation.decided,
  head: () => git(worktree, "rev-parse", "HEAD"),
  remote: (branch) => (branch ? git(worktree, "ls-remote", "origin", `refs/heads/${branch}`).split("\t")[0] : ""),
  commits: (from, to) => git(worktree, "rev-list", `${from}..${to}`).split("\n").filter(Boolean),
  changed: (from, to) => git(worktree, "diff", "--name-only", from, to).split("\n").filter(Boolean),
  conventions: () => (existsSync(join(worktree, "CONVENTIONS.md")) ? readFileSync(join(worktree, "CONVENTIONS.md"), "utf8") : ""),
  items: () => {
    const found = task ? findTask(worktree, task) : null;
    return found ? itemsOf(found.text).map((i) => i.text) : null;
  },
});
const slim = ({ id, axis, kind, severity, rule, where, quote, text, late, history }) => ({ id, axis, kind, severity, rule, where, quote, text, late, history });

function comment(kind, body) {
  const p = join(dir(), "comments");
  mkdirSync(p, { recursive: true });
  const file = join(p, `${String(readdirSync(p).filter((f) => f.endsWith(".md")).length + 1).padStart(2, "0")}-${kind}.md`);
  const fitted = body.length > COMMENT_MAX ? `${body.slice(0, COMMENT_MAX - 200)}\n\n… комментарий обрезан по лимиту GitHub; полный текст — \`${file}\`.\n` : body;
  write(file, fitted);
  if (fitted !== body) write(`${file}.full`, body);
  return file;
}

// Решения о мутантах, которые dl помнит (S0-44): в состоянии цикла, если оно есть.
const decidedMutants = () => (flags.dir !== undefined && existsSync(statePath()) ? (read(statePath()).mutants ?? {}) : {});

async function checked(outFile) {
  const brief = read(outFile.replace(/\.out\.json$/, ".in.json"));
  if (!existsSync(outFile)) return { brief, errors: [`нет выхода ${outFile}`], warnings: [], value: null };
  try {
    const author = ["executor", "fixer"].includes(brief.role);
    const mutation = author ? { mutants: await mutantsAt(brief.worktree), decided: decidedMutants() } : undefined;
    return { brief, ...check(brief, read(outFile), repoOf(brief.worktree, brief.task, mutation)) };
  } catch (e) {
    return { brief, errors: [`выход не проверить: ${e.message.split("\n")[0]}`], warnings: [], value: null };
  }
}

// Brief ревьюера: поля протокола и материал оси в бюджете (context.mjs); patch — путь diff.patch ветки, кроме conflicts.
// hunks — id hunk'ов оси: за них merge ставит вердикт; context.hunks — их текст и причина выбора каждого (S0-45).
// Проверка ответов получает hunk'и дельты от прошлого ревьюированного head.
function reviewerBrief(state, s, plan, a, { worktree, out, patch, body }) {
  const ids = new Set(a.findings.map((f) => f.id));
  const base = {
    role: "reviewer", agent: a.agent, axis: a.axis, job: a.job, pr: state.pr, task: state.task, worktree, wave: plan.wave,
    base: s.base, head: s.head, reasons: plan.reasons?.[a.axis] ?? [],
    expectations: a.axis === "spec" ? s.expectations : undefined, triggers: a.axis === "architecture" ? s.triggers : undefined,
    hunks: a.hunks?.map((h) => h.id), files: a.files, range: a.range, findings: a.findings.map(slim), disputed: plan.disputed.filter((id) => ids.has(id)),
    answers: (state.answers?.items ?? []).filter((x) => ids.has(x.id)), diff: a.job === "conflicts" ? undefined : patch, out,
  };
  // Spec получает отчёт мутаций `prove --ready` и решения авторов о выживших (S0-44).
  const mutation = a.axis === "spec" ? { report: reportOf(worktree), decisions: state.mutants ?? {} } : null;
  const hunks = a.job === "conflicts" ? null : (a.hunks ?? s.delta ?? []);
  return reviewerContext(base, { hunks, body: a.axis === "spec" ? body() : null, mutation });
}

// Тело PR для brief Spec: ревьюеру gh не нужен. gh не ответил — тела нет, и brief называет это в cut.
function prBody(pr) {
  try {
    return gh("pr", "view", String(pr), "--json", "body").body ?? null;
  } catch {
    return null;
  }
}

// Hunk'и ветки от merge-base с origin/main; since — прошлый ревьюированный head: от него дельта и late.
const scopeFor = (state, worktree) => scope({ base: "origin/main", since: state.head ?? null, dir: worktree });

function conflictsPlan(state, worktree, n) {
  const head = git(worktree, "rev-parse", "HEAD");
  const range = [`${git(worktree, "merge-base", "origin/main", state.head)}..${state.head}`, `origin/main..${head}`];
  const s = { mode: "conflicts", hunks: [], axes: [], reasons: {}, stops: [], base: state.head, head, triggers: null, lines: 0 };
  return { s, plan: { wave: n, reasons: {}, disputed: [], agents: [{ agent: "verifier", axis: "verify", job: "conflicts", findings: [], files: flags.conflicts.split(","), range }] } };
}

// Оси, которые стартуют вместе с воротами (S0-45): Architecture и Standards; Spec — если отчёт `prove --ready`
// на head уже готов (S0-44). Остальные — после зелёных ворот.
function earlyAxes(worktree, head) {
  const report = reportOf(worktree);
  const ready = report !== null && report.dirty === false && typeof report.head === "string" && (head.startsWith(report.head) || report.head.startsWith(head));
  return ["architecture", "standards", ...(ready ? ["spec"] : [])];
}

// Круг: `--early` — оси, которые стартуют вместе с воротами; без него — остальные агенты того же круга, если он начат
// с воротами, иначе все. Агент, начатый с воротами на прошлом head, остаётся: hunk'и, которые с тех пор задело
// исправление красных ворот, вердикта не получат и идут в следующий круг.
function wave() {
  const state = load();
  const worktree = need("worktree");
  const n = state.wave + 1;
  const wd = waveDir(n);
  const prior = existsSync(join(wd, "scope.json")) ? read(join(wd, "scope.json")) : null;
  const going = prior?.early === true && !flags.conflicts;
  if (going && flags.early) return print({ ok: true, wave: n, agents: [], next: "gate" });
  const started = going ? readdirSync(wd).filter((f) => f.endsWith(".in.json")).map((f) => f.replace(/\.in\.json$/, "")) : [];
  if (!going) for (const f of readdirSync(wd)) rmSync(join(wd, f));
  let s;
  let plan;
  if (flags.conflicts) ({ s, plan } = conflictsPlan(state, worktree, n));
  else {
    s = scopeFor(state, worktree);
    if (s.stops.length) return print({ ok: true, wave: n, next: "owner", why: s.stops.join("; ") });
    plan = planWave(state, s, { axes: flags.early ? earlyAxes(worktree, s.head) : null, skip: started });
    if (going) plan.reasons = { ...prior.reasons, ...plan.reasons };
  }
  write(join(wd, "scope.json"), { ...s, reasons: plan.reasons, early: flags.early === true, worktree });
  if (n === 1 && !flags.early && started.length === 0 && plan.agents.length === 0) return print({ ok: true, wave: n, agents: [], next: "final" });
  const patch = join(wd, "diff.patch");
  if (!flags.conflicts) write(patch, diffOf(worktree, s.base, s.head).patch);
  let body;
  const ctx = { worktree, patch, body: () => (body === undefined ? (body = prBody(state.pr)) : body) };
  const agents = plan.agents.map((a) => {
    const brief = join(wd, `${a.agent}.in.json`);
    write(brief, reviewerBrief(state, s, plan, a, { ...ctx, out: join(wd, `${a.agent}.out.json`) }));
    return { agent: a.agent, brief };
  });
  const briefs = Object.fromEntries(agents.map((a) => [a.agent, statSync(a.brief).size]));
  const reason = reasonOf(state, { rebased: flags.conflicts !== undefined || s.rebased === true });
  save({ ...state, steps: begin(stepsOf(state), { kind: "review", role: "reviewer", job: null, wave: n, reason, briefs }, now()) });
  const next = flags.early ? "gate" : agents.length ? "review" : "merge";
  print({ ok: true, wave: n, axes: plan.agents.map((a) => a.axis), hunks: s.hunks.length, rebased: s.rebased === true, agents, started, next });
}

async function merge() {
  const state = load();
  const n = state.wave + 1;
  const scopeFile = join(dir(), "waves", String(n), "scope.json");
  if (!existsSync(scopeFile)) fail(`нет круга ${n}: сначала wave`);
  const wd = waveDir(n);
  const s = read(scopeFile);
  const results = await Promise.all(readdirSync(wd).filter((f) => f.endsWith(".in.json")).map((f) => checked(join(wd, f.replace(".in.json", ".out.json")))));
  const errors = Object.fromEntries(results.filter((r) => r.errors.length).map((r) => [r.brief.agent, r.errors]));
  if (Object.keys(errors).length) return print({ ok: false, errors });
  const outputs = results.map((r) => r.value);
  // Вердикт оси — за hunk'и её brief'а (S0-45); late — находка вне строк дельты от прошлого ревьюированного head
  // и вне hunk'ов, которые её ось получила в этом круге.
  const reviewed = results.filter((r) => Array.isArray(r.brief.hunks)).map((r) => ({ axis: r.brief.axis, hunks: r.brief.hunks }));
  const changed = changedLines({ base: s.since && !s.rebased ? s.since : s.base, head: s.head, dir: s.worktree });
  const result = mergeWave(state, { wave: n, scope: s, outputs, changed, reviewed });
  const next = { ...result.state, steps: finish(stepsOf(state), { kind: "review", role: "reviewer" }, now(), { head: s.head }) };
  save(next);
  const file = comment("review", review(next, { scope: s, outputs, next: result.next }));
  print({ ok: true, wave: n, next: result.next, why: result.why, open: openFindings(next).map((f) => f.id), warnings: [...results.flatMap((r) => r.warnings), ...result.warnings], comment: file });
}

function executorBrief() {
  const file = join(dir(), "executor.in.json");
  mkdirSync(dir(), { recursive: true });
  const state = existsSync(statePath()) ? read(statePath()) : null;
  // pr и branch — PR, который открыл start (S0-51); без состояния их нет, и шаг 1 делает executor.
  write(file, executorContext({ role: "executor", task: need("task"), pr: state?.pr, branch: state?.branch, worktree: need("worktree"), owner: flags.owner ?? state?.owner?.text, out: join(dir(), "executor.out.json") }));
  stamp((steps) => begin(steps, { kind: "agent", role: "executor", job: null, wave: state?.wave ?? 0, briefs: { executor: statSync(file).size } }, now()));
  print({ ok: true, brief: file });
}

function brief() {
  if (positional[0] === "executor") return executorBrief();
  if (positional[0] !== "fixer") fail("brief executor | fixer");
  const state = load();
  const job = need("job");
  if (!FIXER_JOBS.includes(job)) fail(`--job: ${FIXER_JOBS.join(" | ")}`);
  const file = join(waveDir(state.wave), `fixer-${job}.in.json`);
  // answer решает и советы своего круга (S0-45); tidy — советы и находки вне дельты после круга без блокирующих.
  const loose = job === "tidy" ? looseFindings(state) : [];
  const advice = job === "answer" ? state.findings.filter((f) => f.status === "advice") : loose.filter((f) => f.severity === "advice");
  write(file, fixerContext({
    role: "fixer", job, pr: state.pr, task: state.task, branch: state.branch, worktree: need("worktree"), base: state.head ?? undefined,
    since: job === "tidy" ? git(need("worktree"), "merge-base", "origin/main", "HEAD") : undefined,
    findings: job === "answer" ? openFindings(state).map(slim) : loose.filter((f) => f.severity === "block").map(slim),
    advice: advice.map(slim),
    decisions: job === "answer" ? state.decisions : [], log: flags.log, owner: flags.owner ?? state.owner?.text, out: file.replace(".in.json", ".out.json"),
  }));
  const step = { kind: "agent", role: "fixer", job, wave: state.wave, briefs: { [`fixer-${job}`]: statSync(file).size } };
  save({ ...state, owner: null, steps: begin(stepsOf(state), step, now()) });
  print({ ok: true, brief: file });
}

async function answerCmd() {
  const state = load();
  const job = flags.job ?? "answer";
  const r = await checked(join(waveDir(state.wave), `fixer-${job}.out.json`));
  if (r.errors.length) return print({ ok: false, errors: r.errors });
  const steps = finish(stepsOf(state), { kind: "agent", role: "fixer", job }, now(), { head: r.value.head ?? null });
  if (r.value.status === "needs_owner") {
    save({ ...state, steps });
    return print({ ok: true, status: "needs_owner" });
  }
  const next = { ...recordAnswer(state, r.value, job), steps };
  save(next);
  print({ ok: true, status: "done", head: r.value.head, disputed: next.answers.items.filter((a) => a.action === "disputed").map((a) => a.id), comment: comment("answer", answer(next)) });
}

function writeQuestions(state, file) {
  write(file, questions(state));
  return file;
}

function escalate() {
  const state = load();
  const from = flags.from ? read(flags.from) : null;
  const asker = from ? read(flags.from.replace(/\.out\.json$/, ".in.json")) : {};
  const asked = ask(state, { why: need("why"), question: from?.question, agent: asker.role, job: asker.job });
  const next = { ...asked, steps: begin(stepsOf(state), { kind: "owner", role: null, job: null, wave: state.wave, head: state.head }, now()) };
  save(next);
  const file = comment("escalation", escalation(next));
  print({ ok: true, comment: file, questions: writeQuestions(next, file.replace(/\.md$/, ".questions.json")) });
}

function owner() {
  const state = load();
  const answers = flags.text === undefined ? read(need("answers")) : null;
  const result = answers ? answerFindings(state, answers) : answerText(state, flags.text);
  if (result.errors.length) return print({ ok: false, errors: result.errors });
  const next = { ...result.state, steps: finish(stepsOf(state), { kind: "owner" }, now()) };
  save(next);
  const file = comment("decision", decision(next, answers ? { answers } : { text: flags.text }));
  print({ ok: true, next: result.next, why: result.why, agent: result.agent, job: result.job, comment: file });
}

// Состояние цикла; шаги, записанные до него в steps.json, переходят в состояние.
function init() {
  mkdirSync(dir(), { recursive: true });
  const early = existsSync(stepsPath()) ? read(stepsPath()) : [];
  const existed = existsSync(statePath());
  const from = flags.from ? read(flags.from) : {};
  if (existed) {
    // Состояние могло прийти от start; пробелы executor не теряются.
    const state = rememberMutants(load(), from, "executor");
    save({ ...state, gaps: [...new Set([...(state.gaps ?? []), ...(from.gaps ?? [])])], steps: [...stepsOf(state), ...early] });
  } else {
    const pr = from.pr ?? Number(need("pr"));
    const branch = from.branch ?? need("branch");
    save({ ...rememberMutants(initial({ pr, task: flags.task ?? null, branch, gaps: from.gaps ?? [] }), from, "executor"), steps: early });
  }
  rmSync(stepsPath(), { force: true });
  print({ ok: true, state: statePath(), existed });
}

// Ворота: verify на head, запушенном в ветку цикла, лог — в D/verify.log. Красные трижды подряд — к владельцу.
function gate() {
  const state = load();
  const worktree = need("worktree");
  const start = now();
  if (git(worktree, "status", "--porcelain") !== "") fail("в worktree есть изменения: ворота проверяют запушенный head");
  git(worktree, "fetch", "-q", "origin");
  git(worktree, "checkout", "-q", "--detach", `origin/${state.branch}`);
  const log = join(dir(), "verify.log");
  const fd = openSync(log, "w");
  const run = spawnSync("npm run verify", { cwd: worktree, shell: true, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const green = run.status === 0;
  const head = git(worktree, "rev-parse", "HEAD");
  // Ревью стартует вместе с воротами (S0-45): за прогон `dl wave --early` мог записать состояние — оно читается заново.
  const latest = load();
  const steps = [...stepsOf(latest), { kind: "gate", role: null, job: null, wave: latest.wave, head, start, end: now(), green }];
  save({ ...latest, steps });
  const route = green ? { next: "wave" } : redsInRow(steps) >= 3 ? { next: "escalate", why: "verify красный трижды" } : { next: "red" };
  print({ ok: true, head, green, log, ...route });
}

// Состояние из комментариев PR → {entry, next, …}; entry none — заголовков цикла нет.
function restoreFrom(comments) {
  const last = comments.map((c) => parseHeader(c.body)).filter(Boolean).at(-1);
  if (!last) return { entry: "none" };
  mkdirSync(dir(), { recursive: true });
  save(last.state);
  const qfile = last.state.pending ? writeQuestions(last.state, join(dir(), "questions.json")) : undefined;
  return { entry: last.kind, wave: last.state.wave, ...entryOf(last.kind, last.state), questions: qfile };
}

function restore() {
  print({ ok: true, ...restoreFrom(read(need("comments")).comments ?? []) });
}

// ghText — вывод как текст; gh — разобранный JSON. DEV_LOOP_GH — fake gh тестов.
const ghText = (...args) => {
  const fake = process.env.DEV_LOOP_GH;
  const [cmd, argv] = fake ? [process.execPath, [fake, ...args]] : ["gh", args];
  return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
};
const gh = (...args) => JSON.parse(ghText(...args));
const PR_FIELDS = "number,title,headRefName,isDraft";

function findPr() {
  if (flags.pr) return gh("pr", "view", flags.pr, "--json", PR_FIELDS);
  const task = need("task");
  return gh("pr", "list", "--state", "open", "--search", `${task} in:title`, "--json", PR_FIELDS).find((p) => p.title.startsWith(`${task} `)) ?? null;
}

// Последний brief цикла — поручение агента, который мог оборваться.
function lastBrief(loop) {
  const found = [];
  const walk = (d) => {
    for (const f of existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []) {
      if (f.isDirectory()) walk(join(d, f.name));
      else if (f.name.endsWith(".in.json") && !existsSync(join(d, f.name.replace(".in.json", ".out.json")))) found.push(join(d, f.name));
    }
  };
  walk(loop);
  return found.length === 1 ? found[0] : null;
}

// Рабочая копия владельца, откуда запущен start, — на свежий main, если это ничего не теряет: копия чистая
// и стоит на main или на ветке со смерженным PR. Иначе копия не трогается, а why говорит почему.
function syncCopy(repo) {
  const run = (...args) => git(repo, ...args);
  const behind = () => Number(run("rev-list", "--count", "HEAD..origin/main"));
  if (resolve(repo, run("rev-parse", "--git-dir")) !== resolve(repo, run("rev-parse", "--git-common-dir")))
    return { branch: null, synced: false, behind: null, why: "start запущен не из главной рабочей копии" };
  const branch = run("branch", "--show-current");
  const stay = (why) => ({ branch: branch || null, synced: false, behind: behind(), why });
  if (run("status", "--porcelain") !== "") return stay("в копии есть изменения");
  if (!branch) return stay("копия не на ветке");
  try {
    if (branch !== "main") {
      const merged = gh("pr", "list", "--head", branch, "--state", "merged", "--json", "number").length > 0;
      if (!merged) return stay(`PR ветки ${branch} не смержен`);
      if (run("rev-list", "--count", "origin/main..HEAD") !== "0") return stay(`в ветке ${branch} есть коммиты вне origin/main`);
      run("checkout", "-q", "main");
    }
    run("merge", "-q", "--ff-only", "origin/main");
  } catch (e) {
    return stay(`git: ${String(e.stderr ?? e.message).trim().split("\n")[0]}`);
  }
  return { branch: "main", synced: true, behind: 0, from: branch === "main" ? undefined : branch };
}

// Шаг 1 plan-task для новой задачи (S0-51): ветка s0-NN-<slug> от свежего main, пустой коммит «S0-NN: start»,
// draft PR «S0-NN · <название>». Ветка, оставшаяся от прерванного старта, берётся как есть.
// Файл задачи читается с origin/main: worktree, оставшийся от отказа «нет файла задачи», стоит на старом main.
function openPr(work, task) {
  git(work, "checkout", "-q", "--detach", "origin/main");
  const found = findTask(work, task) ?? fail(`нет файла задачи ${task} в plan/phases/*/tasks на origin/main`);
  const branch = found.branch;
  if (git(work, "ls-remote", "origin", `refs/heads/${branch}`) !== "") {
    git(work, "fetch", "-q", "origin", branch);
    git(work, "checkout", "-q", "--detach", "FETCH_HEAD");
  } else {
    git(work, "commit", "-q", "--allow-empty", "-m", `${task}: start`);
    git(work, "push", "-q", "origin", `HEAD:refs/heads/${branch}`);
  }
  const title = `${task} · ${found.title}`;
  const body = `Задача: \`${found.path}\`\n\nВ работе: описание по шаблону plan-task пишет исполнитель.\n`;
  const url = ghText("pr", "create", "--draft", "--base", "main", "--head", branch, "--title", title, "--body", body);
  const number = Number(/\/pull\/(\d+)/.exec(url)?.[1] ?? fail(`gh pr create: нет номера PR в «${url}»`));
  return { number, title, headRefName: branch, isDraft: true };
}

// Старт или продолжение цикла: PR задачи, worktree, зависимости, состояние и следующий шаг.
function start() {
  const repo = git(".", "rev-parse", "--show-toplevel");
  git(repo, "fetch", "-q", "origin");
  const copy = syncCopy(repo);
  let pr = findPr();
  const task = flags.task ?? /^(S\d-\d{2})\b/.exec(pr?.title ?? "")?.[1] ?? null;
  const loop = flags.dir ?? join(flags.root ?? join("D:/tmp", repo.split("/").at(-1), "dev-loop"), task ?? `pr-${pr.number}`);
  flags.dir = loop;
  const work = join(loop, "work");
  const ref = pr ? `origin/${pr.headRefName}` : "origin/main";
  const created = !existsSync(work);
  if (created) {
    mkdirSync(loop, { recursive: true });
    git(repo, "worktree", "add", "--detach", work, ref);
  }
  const interrupted = !created && (git(work, "status", "--porcelain") !== "" || (pr !== null && git(work, "rev-list", "--count", `${ref}..HEAD`) !== "0"));
  if (existsSync(join(work, "package.json")) && !existsSync(join(work, "node_modules")))
    execFileSync("npm", ["ci"], { cwd: work, shell: process.platform === "win32", stdio: ["ignore", "ignore", "pipe"] });
  const opened = !pr && !interrupted && task !== null;
  if (opened) pr = openPr(work, task);
  let route = { entry: "none", next: "executor" };
  if (pr) {
    route = opened ? route : restoreFrom(gh("pr", "view", String(pr.number), "--json", "comments").comments ?? []);
    if (route.entry === "none") {
      // PR без комментариев цикла: состояние с pr и branch — их берёт brief executor.
      if (!existsSync(statePath())) save(initial({ pr: pr.number, task, branch: pr.headRefName }));
      route = { entry: "none", next: pr.isDraft ? "executor" : "gate" };
    }
  }
  print({ ok: true, task, pr: pr?.number ?? null, branch: pr?.headRefName ?? null, dir: loop, work, created, interrupted, opened, brief: interrupted ? lastBrief(loop) : null, copy, ...route });
}

// Изменения сдачи в worktree: пункты done → [x], задача ✅ со ссылкой на PR на доске, фаза → 🔄 или 🔍.
// → {files: {путь: текст}} или {missing: [пункт]} — пункты, которых executor не назвал выполненными, или {error}.
function closing(worktree, task, out) {
  const found = findTask(worktree, task) ?? fail(`нет файла задачи ${task} в plan/phases/*/tasks`);
  const missing = itemsOf(found.text).filter((i) => !(out.done ?? []).some((d) => d.trim() === i.text)).map((i) => i.text);
  if (missing.length) return { missing };
  const url = gh("pr", "view", String(out.pr), "--json", "url").url;
  const board = closeOnBoard(readFileSync(join(worktree, found.board), "utf8"), task, `[#${out.pr}](${url})`);
  if (board.error) return { error: `${found.board}: ${board.error}` };
  const phase = advancePhase(readFileSync(join(worktree, "plan/STATUS.md"), "utf8"), found.phase, { last: board.last, date: now().slice(0, 10) });
  if (phase.error) return { error: phase.error };
  return { files: { [found.path]: markItems(found.text, out.done), [found.board]: board.text, "plan/STATUS.md": phase.text } };
}

// Шаг 6 plan-task (S0-51) по выходу executor: последний коммит ветки — отметки, доска и фаза; plan-check; PR → ready.
// Пункт, которого executor не назвал, — не сдача: вопрос владельцу по plan-task «Отступления», в worktree ничего не меняется.
function ready() {
  const worktree = need("worktree");
  const from = need("from");
  const out = read(from);
  const task = flags.task ?? read(from.replace(/\.out\.json$/, ".in.json")).task;
  if (out.status !== "ready") fail(`executor не сдал задачу: status ${out.status}`);
  if (git(worktree, "status", "--porcelain") !== "") fail("в worktree есть изменения: сдача коммитит только свои");
  if (git(worktree, "rev-parse", "HEAD") !== repoOf(worktree).remote(out.branch))
    fail(`HEAD worktree не равен origin/${out.branch}`);
  const change = closing(worktree, task, out);
  if (change.missing)
    return print({ ok: true, next: "escalate", missing: change.missing, why: `${task}: не выполнены пункты «Готово, когда»: ${change.missing.map((m) => `«${m}»`).join(", ")} — перенос в новую задачу только с согласия владельца (plan-task, «Отступления»)` });
  if (change.error) fail(change.error);
  for (const [path, text] of Object.entries(change.files)) write(join(worktree, path), text);
  const planCheck = spawnSync(process.execPath, ["plan/tools/plan-check.mjs"], { cwd: worktree, encoding: "utf8" });
  if (planCheck.status !== 0) {
    git(worktree, "checkout", "--", ...Object.keys(change.files));
    return print({ ok: false, error: "plan-check красный — сдача не записана", log: `${planCheck.stdout}${planCheck.stderr}`.trim().split("\n").slice(-20) });
  }
  if (git(worktree, "status", "--porcelain") !== "") {
    git(worktree, "add", "--", ...Object.keys(change.files));
    git(worktree, "commit", "-q", "-m", `${task}: сдача — «Готово, когда», доска, фаза`);
  }
  git(worktree, "push", "-q", "origin", `HEAD:refs/heads/${out.branch}`);
  ghText("pr", "ready", String(out.pr));
  print({ ok: true, head: git(worktree, "rev-parse", "HEAD"), next: "gate" });
}

// Материал шага агента (S0-48): selfcheck — по diff ветки; pr, deviation, where — разделы plan-task как есть.
function step() {
  const name = positional[0];
  const worktree = flags.worktree ?? ".";
  if (name === "selfcheck") return print({ ok: true, step: name, ...selfcheck(worktree, flags.task) });
  if (!(name in STEPS)) fail(`step: selfcheck | ${Object.keys(STEPS).join(" | ")}`);
  const text = stepText(worktree, name) ?? fail(`нет раздела «${STEPS[name]}» в plan-task`);
  print({ ok: true, step: name, text });
}

const commands = {
  start,
  step,
  ready,
  scope: () => print(scope({ base: positional[0] ?? fail("нужен base"), head: positional[1], since: flags.since ?? null })),
  brief,
  init,
  gate,
  wave,
  check: async () => {
    const r = await checked(positional[0] ?? fail("нужен файл .out.json"));
    const { status, pr, head, conflicts, question } = r.value ?? {};
    if (r.errors.length === 0 && ["executor", "fixer"].includes(r.brief.role)) {
      stamp((steps) => finish(steps, { kind: "agent", role: r.brief.role, job: r.brief.job ?? null }, now(), { head: head ?? null }));
      // Решения о мутантах dl помнит по id и снова их не выносит (S0-44); до состояния их переносит init.
      if (flags.dir !== undefined && existsSync(statePath())) save(rememberMutants(load(), r.value, r.brief.role));
    }
    print({ ok: r.errors.length === 0, errors: r.errors, warnings: r.warnings, status, pr, head, conflicts, question: status === "needs_owner" ? question : undefined });
  },
  merge,
  answer: answerCmd,
  escalate,
  owner,
  final: () => {
    const state = load();
    const first = join(dir(), "waves", "1", "scope.json");
    const conventions = conventionsChanged({ dir: need("worktree") });
    const context = contextMissing(dir());
    print({ ok: true, comment: comment("final", final(state, { scope: existsSync(first) ? read(first) : undefined, conventions, context, at: now() })) });
  },
  restore,
};

(commands[command] ?? (() => fail(`команда: ${Object.keys(commands).join(" | ")}`)))();
