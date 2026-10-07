#!/usr/bin/env node
// dev-loop: инструмент оркестратора /dev-loop (plan/dev-loop.md). Каждая команда печатает одну строку JSON.
//   scope <base> [<head>] [--delta] [--main <ref>]          режим и оси круга
//   brief executor --dir D --task T --worktree W [--owner текст]
//   init --dir D --task T (--from executor.out.json | --pr N --branch B)
//   wave --dir D --worktree W [--conflicts a,b]               следующий круг: briefs агентов
//   check <файл.out.json>                                     выход агента против его brief
//   merge --dir D                                             итоги круга → состояние, отчёт
//   brief fixer --dir D --worktree W --job answer|verify-red|rebase|owner [--log P] [--owner текст]
//   answer --dir D                                            ответ исправляющего → состояние, комментарий
//   escalate --dir D --why текст [--from файл.out.json]       вопрос владельцу: комментарий и questions
//   owner --dir D (--answers файл.json | --text текст)        решение владельца → состояние, комментарий
//   final --dir D                                             итоговый комментарий
//   restore --dir D --comments файл.json                      состояние из `gh pr view --json comments`
// Файлы цикла в D: state.json, waves/<n>/<агент>.in.json и .out.json, waves/<n>/scope.json, comments/<NN>-<вид>.md.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, FIXER_JOBS } from "./dev-loop/protocol.mjs";
import { answer, decision, escalation, final, parseHeader, questions, review } from "./dev-loop/render.mjs";
import { changedLines, scope } from "./dev-loop/scope.mjs";
import { answerFindings, answerText, ask, entryOf, initial, mergeWave, openFindings, planWave, recordAnswer, toAnswer } from "./dev-loop/state.mjs";

const COMMENT_MAX = 65000;
const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--delta") flags.delta = true;
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
const git = (worktree, ...args) => execFileSync("git", args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const repoOf = (worktree) => ({
  head: () => git(worktree, "rev-parse", "HEAD"),
  remote: (branch) => (branch ? git(worktree, "ls-remote", "origin", `refs/heads/${branch}`).split("\t")[0] : ""),
  commits: (from, to) => git(worktree, "rev-list", `${from}..${to}`).split("\n").filter(Boolean),
});
const slim = ({ id, axis, severity, rule, where, quote, text, late, history }) => ({ id, axis, severity, rule, where, quote, text, late, history });

function comment(kind, body) {
  const p = join(dir(), "comments");
  mkdirSync(p, { recursive: true });
  const file = join(p, `${String(readdirSync(p).filter((f) => f.endsWith(".md")).length + 1).padStart(2, "0")}-${kind}.md`);
  const fitted = body.length > COMMENT_MAX ? `${body.slice(0, COMMENT_MAX - 200)}\n\n… комментарий обрезан по лимиту GitHub; полный текст — \`${file}\`.\n` : body;
  write(file, fitted);
  if (fitted !== body) write(`${file}.full`, body);
  return file;
}

function checked(outFile) {
  const brief = read(outFile.replace(/\.out\.json$/, ".in.json"));
  if (!existsSync(outFile)) return { brief, errors: [`нет выхода ${outFile}`], warnings: [], value: null };
  try {
    return { brief, ...check(brief, read(outFile), repoOf(brief.worktree)) };
  } catch (e) {
    return { brief, errors: [`выход не проверить: ${e.message.split("\n")[0]}`], warnings: [], value: null };
  }
}

function reviewerBrief(state, s, plan, a, worktree, out) {
  const ids = new Set(a.findings.map((f) => f.id));
  return {
    role: "reviewer", agent: a.agent, axis: a.axis, job: a.job, pr: state.pr, task: state.task, worktree, wave: plan.wave,
    base: s.base, head: s.head, reasons: s.reasons?.[a.axis] ?? [],
    expectations: a.axis === "spec" ? s.expectations : undefined, triggers: a.axis === "architecture" ? s.triggers : undefined,
    files: a.files, range: a.range, findings: a.findings.map(slim), disputed: plan.disputed.filter((id) => ids.has(id)),
    answers: (state.answers?.items ?? []).filter((x) => ids.has(x.id)), out,
  };
}

function scopeFor(state, worktree) {
  if (state.wave === 0) return scope({ base: "origin/main", dir: worktree });
  const delta = scope({ base: state.head, delta: true, dir: worktree });
  return delta.rebased ? { ...scope({ base: "origin/main", dir: worktree }), rebased: true } : delta;
}

function conflictsPlan(state, worktree, n) {
  const head = git(worktree, "rev-parse", "HEAD");
  const range = [`${git(worktree, "merge-base", "origin/main", state.head)}..${state.head}`, `origin/main..${head}`];
  const s = { mode: "conflicts", axes: [], reasons: {}, stops: [], base: state.head, head, triggers: null, lines: 0 };
  return { s, plan: { wave: n, mode: "conflicts", disputed: [], agents: [{ agent: "verifier", axis: "verify", job: "conflicts", findings: [], files: flags.conflicts.split(","), range }] } };
}

function wave() {
  const state = load();
  const worktree = need("worktree");
  const n = state.wave + 1;
  const wd = waveDir(n);
  for (const f of readdirSync(wd)) rmSync(join(wd, f));
  let s;
  let plan;
  if (flags.conflicts) ({ s, plan } = conflictsPlan(state, worktree, n));
  else {
    s = scopeFor(state, worktree);
    if (s.stops.length) return print({ ok: true, wave: n, next: "owner", why: s.stops.join("; ") });
    plan = planWave(state, s);
  }
  write(join(wd, "scope.json"), { ...s, worktree });
  if (n === 1 && s.mode === "none") return print({ ok: true, wave: n, mode: "none", agents: [], next: "final" });
  const agents = plan.agents.map((a) => {
    const brief = join(wd, `${a.agent}.in.json`);
    write(brief, reviewerBrief(state, s, plan, a, worktree, join(wd, `${a.agent}.out.json`)));
    return { agent: a.agent, brief };
  });
  print({ ok: true, wave: n, mode: s.mode, axes: s.axes, rebased: s.rebased === true, agents, next: agents.length ? "review" : "merge" });
}

function merge() {
  const state = load();
  const n = state.wave + 1;
  const scopeFile = join(dir(), "waves", String(n), "scope.json");
  if (!existsSync(scopeFile)) fail(`нет круга ${n}: сначала wave`);
  const wd = waveDir(n);
  const s = read(scopeFile);
  const results = readdirSync(wd).filter((f) => f.endsWith(".in.json")).map((f) => checked(join(wd, f.replace(".in.json", ".out.json"))));
  const errors = Object.fromEntries(results.filter((r) => r.errors.length).map((r) => [r.brief.agent, r.errors]));
  if (Object.keys(errors).length) return print({ ok: false, errors });
  const outputs = results.map((r) => r.value);
  const changed = changedLines({ base: s.base, head: s.head, dir: s.worktree });
  const result = mergeWave(state, { wave: n, scope: s, outputs, changed });
  save(result.state);
  const file = comment("review", review(result.state, { scope: s, outputs, next: result.next }));
  print({ ok: true, wave: n, next: result.next, why: result.why, open: openFindings(result.state).map((f) => f.id), warnings: [...results.flatMap((r) => r.warnings), ...result.warnings], comment: file });
}

function executorBrief() {
  const file = join(dir(), "executor.in.json");
  mkdirSync(dir(), { recursive: true });
  const owner = flags.owner ?? (existsSync(statePath()) ? read(statePath()).owner?.text : undefined);
  write(file, { role: "executor", task: need("task"), worktree: need("worktree"), owner, out: join(dir(), "executor.out.json") });
  print({ ok: true, brief: file });
}

function brief() {
  if (positional[0] === "executor") return executorBrief();
  if (positional[0] !== "fixer") fail("brief executor | fixer");
  const state = load();
  const job = need("job");
  if (!FIXER_JOBS.includes(job)) fail(`--job: ${FIXER_JOBS.join(" | ")}`);
  const file = join(waveDir(state.wave), `fixer-${job}.in.json`);
  const answering = job === "answer";
  write(file, {
    role: "fixer", job, pr: state.pr, task: state.task, branch: state.branch, worktree: need("worktree"), base: state.head ?? undefined,
    findings: answering ? openFindings(state).map(slim) : [], advice: answering ? state.findings.filter((f) => f.status === "advice").map(slim) : [],
    decisions: answering ? state.decisions : [], log: flags.log, owner: flags.owner ?? state.owner?.text, out: file.replace(".in.json", ".out.json"),
  });
  if (state.owner) save({ ...state, owner: null });
  print({ ok: true, brief: file, answer: answering ? toAnswer(state) : [] });
}

function answerCmd() {
  const state = load();
  const r = checked(join(waveDir(state.wave), "fixer-answer.out.json"));
  if (r.errors.length) return print({ ok: false, errors: r.errors });
  if (r.value.status === "needs_owner") return print({ ok: true, status: "needs_owner" });
  const next = recordAnswer(state, r.value);
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
  const next = ask(state, { why: need("why"), question: from?.question, agent: asker.role, job: asker.job });
  save(next);
  const file = comment("escalation", escalation(next));
  print({ ok: true, comment: file, questions: writeQuestions(next, file.replace(/\.md$/, ".questions.json")) });
}

function owner() {
  const state = load();
  const answers = flags.text === undefined ? read(need("answers")) : null;
  const result = answers ? answerFindings(state, answers) : answerText(state, flags.text);
  if (result.errors.length) return print({ ok: false, errors: result.errors });
  save(result.state);
  const file = comment("decision", decision(result.state, answers ? { answers } : { text: flags.text }));
  print({ ok: true, next: result.next, why: result.why, agent: result.agent, job: result.job, comment: file });
}

function init() {
  mkdirSync(dir(), { recursive: true });
  if (existsSync(statePath())) return print({ ok: true, state: statePath(), existed: true });
  const from = flags.from ? read(flags.from) : {};
  const pr = from.pr ?? Number(need("pr"));
  const branch = from.branch ?? need("branch");
  save(initial({ pr, task: flags.task ?? null, branch, gaps: from.gaps ?? [] }));
  print({ ok: true, state: statePath(), existed: false });
}

function restore() {
  const comments = read(need("comments")).comments ?? [];
  const last = comments.map((c) => parseHeader(c.body)).filter(Boolean).at(-1);
  if (!last) return print({ ok: true, entry: "none" });
  mkdirSync(dir(), { recursive: true });
  save(last.state);
  const entry = entryOf(last.kind, last.state);
  const qfile = last.state.pending ? writeQuestions(last.state, join(dir(), "questions.json")) : undefined;
  print({ ok: true, entry: last.kind, wave: last.state.wave, ...entry, questions: qfile });
}

const commands = {
  scope: () => print(scope({ base: positional[0] ?? fail("нужен base"), head: positional[1], delta: flags.delta === true, main: flags.main })),
  brief,
  init,
  wave,
  check: () => {
    const r = checked(positional[0] ?? fail("нужен файл .out.json"));
    const { status, pr, head, conflicts, question } = r.value ?? {};
    print({ ok: r.errors.length === 0, errors: r.errors, warnings: r.warnings, status, pr, head, conflicts, question: status === "needs_owner" ? question : undefined });
  },
  merge,
  answer: answerCmd,
  escalate,
  owner,
  final: () => {
    const state = load();
    const first = join(dir(), "waves", "1", "scope.json");
    print({ ok: true, comment: comment("final", final(state, { scope: existsSync(first) ? read(first) : undefined })) });
  },
  restore,
};

(commands[command] ?? (() => fail(`команда: ${Object.keys(commands).join(" | ")}`)))();
