#!/usr/bin/env node
// verify: the steps of `npm run verify` in parallel (S0-47). Each step is the npm script of its name, run in the
// current directory; its stdout and stderr are buffered and printed in the order of the steps, not of their finish.
// The full output goes to .lattice/verify.log; the last line of stdout is the outcome as JSON:
//   {"ok": true, "steps": [{"step": "lint:ids", "ms": 640, "exit": 0}, …], "log": "<path of the log>"}
// The exit code is 1 when any step fails. CI runs the steps one by one (.github/workflows/ci.yml).
//   node scripts/verify.mjs
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const STEPS = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build", "test"];

/** Runs the npm script `step`; resolves with its exit code, its time and its output, stdout and stderr as they came. */
function run(step) {
  return new Promise((done) => {
    const start = performance.now();
    const chunks = [];
    // One command line, not arguments with a shell: npm is npm.cmd on Windows, and the step names are constants.
    const child = spawn(`npm run --silent ${step}`, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    child.on("error", (error) => chunks.push(Buffer.from(`${error.message}\n`)));
    child.on("close", (code) => done({ step, ms: Math.round(performance.now() - start), exit: code ?? 1, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

const log = resolve(".lattice", "verify.log");
const running = STEPS.map(run);
const results = [];
let text = "";
for (const pending of running) {
  const { step, ms, exit, output } = await pending;
  const part = `# ${step}: exit ${exit}, ${ms} ms\n${output}${output === "" || output.endsWith("\n") ? "" : "\n"}`;
  process.stdout.write(part);
  text += part;
  results.push({ step, ms, exit });
}

const ok = results.every((r) => r.exit === 0);
const outcome = JSON.stringify({ ok, steps: results, log });
mkdirSync(dirname(log), { recursive: true });
writeFileSync(log, `${text}${outcome}\n`);
process.stdout.write(`${outcome}\n`);
process.exitCode = ok ? 0 : 1;
