#!/usr/bin/env node
// verify: the steps of `npm run verify` in parallel (S0-47). Each step is the npm script of its name, run in the
// current directory; its stdout and stderr are buffered and printed in the order of the steps, not of their finish.
// The full output goes to .lattice/verify.log; the last line of stdout is the outcome as JSON:
//   {"ok": true, "steps": [{"step": "lint:ids", "ms": 640, "exit": 0}, …], "log": "<path of the log>"}
// The exit code is 1 when any step fails. CI runs the steps one by one (.github/workflows/ci.yml).
// scripts/prove.mjs runs its jobs through runSteps and ends through finish (S0-42); it and scripts/mutate.mjs read
// their flags through flagOf.
//   node scripts/verify.mjs
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const STEPS = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build", "test"];

/** Runs the command of `job`; resolves with its exit code, its time and its output, stdout and stderr as they came. */
function run({ step, command, env }) {
  return new Promise((done) => {
    const start = performance.now();
    const chunks = [];
    // One command line, not arguments with a shell: npm is npm.cmd on Windows, and the commands are built from constants.
    const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    child.on("error", (error) => chunks.push(Buffer.from(`${error.message}\n`)));
    child.on("close", (code) => done({ step, ms: Math.round(performance.now() - start), exit: code ?? 1, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

/**
 * Runs every job `{step, command, env?, queue?}` at once — but the jobs of one `queue`, which run one after another in
 * their order — and prints the output of each in the order of `jobs`, under a line `# <step>: exit <code>, <ms> ms`;
 * resolves with `{results: [{step, ms, exit}], text}`, text being what it printed.
 */
export async function runSteps(jobs) {
  const queues = new Map();
  const running = jobs.map((job) => {
    if (job.queue === undefined) return run(job);
    const after = (queues.get(job.queue) ?? Promise.resolve()).then(() => run(job));
    queues.set(job.queue, after);
    return after;
  });
  const results = [];
  let text = "";
  for (const pending of running) {
    const { step, ms, exit, output } = await pending;
    const part = `# ${step}: exit ${exit}, ${ms} ms\n${output}${output === "" || output.endsWith("\n") ? "" : "\n"}`;
    process.stdout.write(part);
    text += part;
    results.push({ step, ms, exit });
  }
  return { results, text };
}

/** Writes `text` and the outcome to the log, prints the outcome as the last line of stdout and sets the exit code. */
export function finish(log, text, outcome, ok) {
  const line = JSON.stringify(outcome);
  mkdirSync(dirname(log), { recursive: true });
  writeFileSync(log, `${text}${line}\n`);
  process.stdout.write(`${line}\n`);
  process.exitCode = ok ? 0 : 1;
}

/** The value of the flag `--name` in `args`, or `fallback`. */
export function flagOf(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
}

/** Whether the module at `url` is the script node runs. */
export const isMain = (url) => process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));

if (isMain(import.meta.url)) {
  const log = resolve(".lattice", "verify.log");
  const { results, text } = await runSteps(STEPS.map((step) => ({ step, command: `npm run --silent ${step}` })));
  const ok = results.every((r) => r.exit === 0);
  finish(log, text, { ok, steps: results, log }, ok);
}
