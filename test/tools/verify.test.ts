// scripts/verify.mjs runs the steps of `npm run verify` in parallel and reports them in the order of the steps (S0-47).
// These cases run it in a throwaway package whose scripts stand in for the steps: each prints a line and exits
// with the code given, after a delay that makes the steps finish out of their order.
import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../scripts/verify.mjs");
const steps = ["lint:ids", "plan:check", "lint:eol", "typecheck", "lint", "build", "test"] as const;
const dirs: string[] = [];

type Step = { readonly exit: number; readonly delay: number };
type Report = { ok: boolean; steps: { step: string; ms: number; exit: number }[]; log: string };
type Run = { readonly code: number; readonly out: string; readonly report: Report };

// A step prints its name, waits, prints its exit code to stderr, and exits with it.
const stand = `const [step, exit, delay] = process.argv.slice(2);
console.log("out " + step);
setTimeout(() => { console.error("err " + step + " " + exit); process.exit(Number(exit)); }, Number(delay));
`;

async function verify(of: { readonly [step: string]: Step }): Promise<Run> {
  const dir = await mkdtemp(join(tmpdir(), "verify-"));
  dirs.push(dir);
  const scripts = Object.fromEntries(steps.map((s, i) => [s, `node stand.mjs ${s} ${of[s]?.exit ?? 0} ${of[s]?.delay ?? 50 * (steps.length - i)}`]));
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "stand", private: true, scripts }));
  await writeFile(join(dir, "stand.mjs"), stand);
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [tool], { cwd: dir, encoding: "utf8" }, (error, stdout, stderr) => {
      const last = stdout.trimEnd().split("\n").at(-1) ?? "";
      try {
        resolve({ code: typeof error?.code === "number" ? error.code : 0, out: stdout, report: JSON.parse(last) as Report });
      } catch {
        reject(new Error(`verify: the last line of its output is not JSON: ${last}\n${stderr}`));
      }
    });
  });
}

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("verify, the steps in parallel", () => {
  it("reports ok with every step green, in the order of the steps though they finish in reverse", async () => {
    const run = await verify({});
    expect(run.code).toBe(0);
    expect(run.report.ok).toBe(true);
    expect(run.report.steps.map((s) => [s.step, s.exit])).toEqual(steps.map((s) => [s, 0]));
    expect(run.report.steps.every((s) => Number.isInteger(s.ms) && s.ms >= 0)).toBe(true);
    const at = steps.map((s) => run.out.indexOf(`out ${s}`));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("exits non-zero when a step fails, names it with its exit code and keeps its whole output in the log", async () => {
    const run = await verify({ lint: { exit: 3, delay: 10 } });
    expect(run.code).not.toBe(0);
    expect(run.report.ok).toBe(false);
    expect(run.report.steps.filter((s) => s.exit !== 0)).toEqual([{ step: "lint", ms: expect.any(Number) as number, exit: 3 }]);
    const log = readFileSync(run.report.log, "utf8");
    expect(log).toContain("out lint");
    expect(log).toContain("err lint 3");
    for (const s of steps) expect(log).toContain(`out ${s}`);
  });
});
