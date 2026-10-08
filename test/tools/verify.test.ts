// scripts/verify.mjs runs the steps of `npm run verify` in parallel and reports them in the order of the steps (S0-47).
// These cases run it in a throwaway package whose scripts stand in for the steps: each prints a line and exits
// with the code given, after a delay that makes the steps finish out of their order, or, to show that the steps
// overlap, once every step has started.
import { afterAll, describe, expect, it } from "vitest";
import { SAFEGUARD_MS } from "../support/budget.js";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const tool = program("scripts/verify.mjs");
const steps = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build", "test"] as const;
const dirs: Scratch[] = [];

// `delay: "meet"` — the step marks itself started and ends when every step has, printing how many it saw. Its window is
// the safeguard of a test, not a budget (S0-41): starting seven processes under a loaded run took more than 2 s (S0-52).
// Run one by one, the first step waits out the window, the case fails on its timeout, and the window ends the step.
type Step = { readonly exit: number; readonly delay: number | "meet" };
type Report = { ok: boolean; steps: { step: string; ms: number; exit: number }[]; log: string };
type Run = { readonly code: number; readonly out: string; readonly report: Report; readonly dir: Scratch };

// A step prints its name, waits (a delay, or the meeting of the steps), prints its exit code to stderr, and exits with it.
const stand = `import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
const [step, exit, delay, total] = process.argv.slice(2);
console.log("out " + step);
const end = () => { console.error("err " + step + " " + exit); process.exit(Number(exit)); };
if (delay === "meet") {
  mkdirSync("started", { recursive: true });
  writeFileSync("started/" + step.replace(":", "-"), "");
  const until = Date.now() + ${SAFEGUARD_MS};
  const wait = () => {
    const seen = readdirSync("started").length;
    if (seen < Number(total) && Date.now() < until) return void setTimeout(wait, 10);
    console.log("met " + step + " " + seen);
    end();
  };
  wait();
} else setTimeout(end, Number(delay));
`;

async function verify(of: { readonly [step: string]: Step }): Promise<Run> {
  const dir = scratch("verify-");
  dirs.push(dir);
  const scripts = Object.fromEntries(steps.map((s, i) => [s, `node stand.mjs ${s} ${of[s]?.exit ?? 0} ${of[s]?.delay ?? 50 * (steps.length - i)} ${steps.length}`]));
  dir.write("package.json", JSON.stringify({ name: "stand", private: true, scripts }));
  dir.write("stand.mjs", stand);
  const ran = await tool.start([], { cwd: dir.dir });
  const last = ran.stdout.trimEnd().split("\n").at(-1) ?? "";
  try {
    return { code: ran.status, out: ran.stdout, report: JSON.parse(last) as Report, dir };
  } catch {
    throw new Error(`verify: the last line of its output is not JSON: ${last}\n${ran.stderr}`);
  }
}

afterAll(() => {
  for (const dir of dirs.splice(0)) dir.remove();
});

describe("verify, the steps in parallel", () => {
  it("reports ok with every step green, in the order of the steps though they finish in reverse", async () => {
    const run = await verify({});
    expect(run.code).toBe(0);
    expect(run.report.ok).toBe(true);
    expect(run.report.steps.map((s) => [s.step, s.exit])).toEqual(steps.map((s) => [s, 0]));
    expect(run.report.steps.every((s) => Number.isInteger(s.ms) && s.ms >= 0)).toBe(true);
    const lines = run.out.split(/\r?\n/);
    const at = steps.map((s) => lines.indexOf(`out ${s}`));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("runs the steps at once: every step has started before any ends", async () => {
    const run = await verify(Object.fromEntries(steps.map((s) => [s, { exit: 0, delay: "meet" }])));
    expect(run.report.ok).toBe(true);
    const lines = run.out.split(/\r?\n/);
    expect(steps.filter((s) => !lines.includes(`met ${s} ${steps.length}`))).toEqual([]);
  });

  it("exits non-zero when a step fails, names it with its exit code and keeps its whole output in the log", async () => {
    const run = await verify({ lint: { exit: 3, delay: 10 } });
    expect(run.code).not.toBe(0);
    expect(run.report.ok).toBe(false);
    expect(run.report.steps.filter((s) => s.exit !== 0)).toEqual([{ step: "lint", ms: expect.any(Number) as number, exit: 3 }]);
    const log = run.dir.text(run.report.log);
    const lines = log.split(/\r?\n/);
    expect(lines).toContain("err lint 3");
    expect(steps.filter((s) => !lines.includes(`out ${s}`))).toEqual([]);
  });
});
