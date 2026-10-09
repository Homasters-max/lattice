// dev-loop gate (S0-46, S0-43): the gate is a program — it puts the worktree on the head pushed to the branch, runs
// prove of the head by the records of its runs into a log, keeps in its step what it took from the records, what it
// ran, the mismatches of shadow and the keys of the red test sets, and says where to go. The repository's prove is a
// stand-in that prints the line of scripts/prove.mjs; the records prove itself writes are the cases of prove.test.ts.
// Time comes through DEV_LOOP_NOW, so the cases never wait. The repository is built once and copied for each case (S0-40).
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { NO_MAINTENANCE } from "../support/git.js";
import { program, type Program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const git = program("git");
let temp: Scratch;
let folders = 0;
// The fake gh of the tool: dl wave asks GitHub for the body of the PR for the brief of Spec (S0-48).
let gh = "";
const BRANCH = "s0-99-x";
type Json = { [key: string]: unknown };
type Loop = { work: string; dir: string };
type Files = { readonly [path: string]: string };
type Step = { kind: string; role: string | null; job: string | null; wave: number; head: string | null; start: string; end: string | null; green?: boolean; mismatches?: Json[] };
// The moment of a command: minute m of one morning; red — prove fails; mismatch — prove names a mismatch of shadow;
// hold — prove waits for this file.
type At = { at: string; red?: boolean; mismatch?: boolean; hold?: string };

const t = (m: number): At => ({ at: new Date(Date.UTC(2026, 9, 8, 10, m)).toISOString() });
const red = (m: number): At => ({ ...t(m), red: true });

async function sh(cwd: string, cmd: Program, args: readonly string[], env = process.env): Promise<string> {
  const ran = await cmd.start(args, { cwd, env });
  if (ran.status !== 0 && cmd === git) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

/** A new folder of the run inside the scratch folder of this file. */
const folder = (prefix: string) => temp.mkdir(`${prefix}${++folders}`);

async function commit(work: string, files: Files, message: string): Promise<string> {
  for (const [path, text] of Object.entries(files)) temp.write(join(work, path), text);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", message]);
  await sh(work, git, ["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`]);
  return sh(work, git, ["rev-parse", "HEAD"]);
}

const land = (n: number) => `export function land(): number {\n  return ${n};\n}\n`;
// The key of the record of the one test set of the repository (scripts/runs.mjs): a sha256 in hex.
const KEY = "ab".repeat(32);
// prove of the repository: it prints its arguments and ends with the line of scripts/prove.mjs — the test set ledger
// under KEY, red while RED is set, and with --gate what the gate ran and, while MISMATCH is set, a mismatch of shadow;
// its output goes to the log of the gate. While HOLD is set it says it started and waits for the file HOLD, so a case
// runs another command of dl during the gate. CONVENTIONS.md holds the item findings name (CONVENTIONS §N.M); the records
// of runs are in .lattice/, which git ignores.
const MAIN: Files = {
  ".gitignore": ".lattice/\n",
  "src/ledger/land.ts": land(1),
  "CONVENTIONS.md": "# C\n\n## 1. A\n\n### §1.1 One\nОбласть: `src/**`\n",
  "package.json": JSON.stringify({ name: "t", private: true, scripts: { prove: "node prove.mjs" } }) + "\n",
  "prove.mjs": [
    'import { existsSync, writeFileSync } from "node:fs";',
    "const hold = process.env.HOLD;",
    "if (hold) {",
    '  writeFileSync(`${hold}.started`, "");',
    "  const sleep = new Int32Array(new SharedArrayBuffer(4));",
    "  for (const end = Date.now() + 30000; !existsSync(hold) && Date.now() < end; ) Atomics.wait(sleep, 0, 0, 20);",
    "}",
    "const args = process.argv.slice(2);",
    "const red = Boolean(process.env.RED);",
    'console.log(`prove ${args.join(" ")}: ${red ? "boom" : "fine"}`);',
    'const outcome = red ? "failed" : "ok";',
    `const sets = [{ set: "ledger", key: "${KEY}", outcome }];`,
    `const mismatches = process.env.MISMATCH ? [{ set: "ledger", key: "${KEY}", recorded: "ok", outcome }] : [];`,
    'const gate = args.includes("--gate") ? { shadow: args.includes("--shadow"), recorded: [], taken: [], ran: ["ledger"], mismatches } : undefined;',
    'console.log(JSON.stringify({ outcome: red ? "failed" : "passed", sets, gate }));',
    "process.exit(red ? 1 : 0);",
    "",
  ].join("\n"),
  // The task the executor hands in: dl check reads the items it names done (S0-51).
  "plan/phases/S0-x/tasks/S0-99-x.md": "---\nid: S0-99\ntitle: X\nphase: S0\n---\n\n## Готово, когда\n\n- [ ] land works\n",
};

// A work tree with an origin whose main holds MAIN and a branch with one change; the loop is not started.
async function build(): Promise<string> {
  const root = folder("base-");
  const work = join(root, "work");
  for (const [path, text] of Object.entries(MAIN)) temp.write(join(work, path), text);
  await sh(root, git, ["init", "-q", "--template=", "--bare", "origin.git"]);
  await sh(join(root, "origin.git"), git, NO_MAINTENANCE);
  for (const args of [["init", "-q", "--template="], NO_MAINTENANCE, ["config", "user.email", "t@t"], ["config", "user.name", "t"], ["config", "core.autocrlf", "false"], ["remote", "add", "origin", join(root, "origin.git")]]) await sh(work, git, args);
  await sh(work, git, ["add", "-A"]);
  await sh(work, git, ["commit", "-q", "-m", "base"]);
  await sh(work, git, ["push", "-q", "origin", "HEAD:refs/heads/main", `HEAD:refs/heads/${BRANCH}`]);
  await commit(work, { "src/ledger/land.ts": land(2) }, "task");
  return root;
}

let built: Promise<string> | undefined;

async function loop(): Promise<Loop> {
  built ??= build();
  const from = await built;
  const root = folder("case-");
  temp.copy(from, root);
  const work = join(root, "work");
  await sh(work, git, ["remote", "set-url", "origin", join(root, "origin.git")]);
  return { work, dir: join(root, "loop") };
}

async function dl(l: Loop, when: At, ...args: string[]): Promise<Json> {
  const env: NodeJS.ProcessEnv = { ...process.env, DEV_LOOP_GH: gh, DEV_LOOP_NOW: when.at };
  if (when.red === true) env.RED = "1";
  else delete env.RED;
  if (when.hold !== undefined) env.HOLD = when.hold;
  else delete env.HOLD;
  if (when.mismatch === true) env.MISMATCH = "1";
  else delete env.MISMATCH;
  return JSON.parse(await sh(l.work, tool, [...args, "--dir", l.dir], env)) as Json;
}

const read = (file: string): Json => JSON.parse(temp.text(file)) as Json;
const outOf = (brief: string) => brief.replace(".in.json", ".out.json");
const out = (brief: string, value: Json) => temp.write(outOf(brief), JSON.stringify(value));
const head = (l: Loop) => sh(l.work, git, ["rev-parse", "HEAD"]);
const steps = (l: Loop) => read(join(l.dir, "state.json")).steps as Step[];

// A fixer of a job without findings (verify-red, rebase, owner) from dl brief to dl check.
async function fixer(l: Loop, from: At, to: At, job: string): Promise<void> {
  const brief = (await dl(l, from, "brief", "fixer", "--worktree", l.work, "--job", job, "--log", join(l.dir, "verify.log"))).brief as string;
  out(brief, { status: "done", head: await head(l), answers: [] });
  expect(await dl(l, to, "check", outOf(brief))).toMatchObject({ ok: true, status: "done" });
}

beforeAll(() => {
  temp = scratch("dev-loop-gate-");
  gh = temp.write("gh.mjs", 'console.log(JSON.stringify({ body: "PR body" }));\n');
});

afterAll(() => {
  temp.remove();
});

describe.concurrent("dev-loop gate", { timeout: 60_000 }, () => {
  it("runs prove of the head by its records — in shadow, every test set — into the log, and goes to the round when it is green, to the fixer when it is red", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const log = join(l.dir, "verify.log");
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: false, log, shadow: true, taken: [], ran: ["ledger"], mismatches: [], next: "red" });
    expect(temp.text(log)).toContain("prove --gate --shadow: boom");
    expect(await dl(l, t(2), "gate", "--worktree", l.work)).toMatchObject({ ok: true, green: true, log, next: "wave" });
    expect(temp.text(log)).toContain("prove --gate --shadow: fine");
    expect(temp.text(log)).not.toContain("boom");
  });

  it("asks the owner on the third red in a row; a green gate starts the count again", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
    expect(await dl(l, red(2), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
    expect(await dl(l, red(3), "gate", "--worktree", l.work)).toMatchObject({ green: false, next: "escalate", why: "verify красный трижды" });
    expect(await dl(l, t(4), "gate", "--worktree", l.work)).toMatchObject({ green: true, next: "wave" });
    expect(await dl(l, red(5), "gate", "--worktree", l.work)).toMatchObject({ next: "red" });
  });

  it("keeps what dl wave --early wrote to the state while prove ran: the gate reads the state again before it writes", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const hold = join(l.dir, "hold");
    const gate = dl(l, { ...t(1), hold }, "gate", "--worktree", l.work);
    for (let i = 0; i < 1500 && !temp.exists(`${hold}.started`); i++) await new Promise((done) => setTimeout(done, 20));
    expect(await dl(l, t(2), "wave", "--worktree", l.work, "--early")).toMatchObject({ ok: true, wave: 1, next: "gate" });
    temp.write(hold, "");
    expect(await gate).toMatchObject({ ok: true, green: true, next: "wave" });
    expect(steps(l).map((x) => [x.kind, x.wave, x.start, x.end])).toEqual([
      ["review", 1, t(2).at, null],
      ["gate", 0, t(1).at, t(1).at],
    ]);
  });

  it("verifies the head pushed to the branch, and refuses a worktree with changes", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const pushed = await head(l);
    temp.write(join(l.work, "local.txt"), "x");
    expect(await dl(l, t(1), "gate", "--worktree", l.work)).toMatchObject({ ok: false, error: "в worktree есть изменения: ворота проверяют запушенный head" });
    await sh(l.work, git, ["add", "-A"]);
    await sh(l.work, git, ["commit", "-q", "-m", "local"]);
    expect(await dl(l, t(2), "gate", "--worktree", l.work)).toMatchObject({ ok: true, head: pushed, green: true });
    expect(await head(l)).toBe(pushed);
  });
});

describe.concurrent("dev-loop gate, the records of runs", { timeout: 60_000 }, () => {
  it("names a mismatch of shadow in the output of the gate, in its step and in the final report", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    const mismatch = { set: "ledger", key: KEY, recorded: "ok", outcome: "ok" };
    expect(await dl(l, t(1), "gate", "--worktree", l.work)).toMatchObject({ green: true, mismatches: [] });
    expect(await dl(l, { ...red(2), mismatch: true }, "gate", "--worktree", l.work)).toMatchObject({ green: false, mismatches: [{ ...mismatch, outcome: "failed" }] });
    expect(steps(l).map((s) => s.mismatches)).toEqual([[], [{ ...mismatch, outcome: "failed" }]]);
    const report = temp.text((await dl(l, t(3), "final", "--worktree", l.work)).comment as string);
    expect(report).toContain("Ворота в shadow: прогонов 2, расхождений с записями 1.");
    expect(report).toContain(`- \`${(await head(l)).slice(0, 7)}\` · ledger: запись ok, прогон failed`);
  });

  it("gives the brief verify-red the records of the test sets the gate found red", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ green: false, next: "red" });
    const run = { test_set: "ledger", code: "sha256:c", knowledge: "sha256:k", tools: "sha256:t", environment: { os: "linux", node: 22, git: 2 }, seed: 7, outcome: "failed", failed: ["test/ledger/a.test.ts > lands"], ms: 900, head: await head(l), at: t(1).at };
    temp.write(join(l.work, ".lattice", "verify-runs", `${KEY}.json`), JSON.stringify(run));
    const brief = read((await dl(l, t(2), "brief", "fixer", "--worktree", l.work, "--job", "verify-red", "--log", join(l.dir, "verify.log"))).brief as string);
    expect((brief.context as Json).runs).toEqual([run]);
  });

  it("sends «продолжить» to the gate when a step after the green gate names another head", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, t(1), "gate", "--worktree", l.work)).toMatchObject({ green: true });
    await commit(l.work, { "src/ledger/land.ts": land(3) }, "S0-99: owner — three");
    await fixer(l, t(2), t(3), "owner");
    await dl(l, t(4), "escalate", "--why", "проверить");
    expect(await dl(l, t(5), "owner", "--text", "стоп")).toMatchObject({ next: "stop" });
    expect(await dl(l, t(6), "owner", "--text", "продолжить")).toMatchObject({ next: "gate" });
  });

  it("sends «продолжить» to the gate when the last gate on the head is red, though an earlier gate on it was green", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, t(1), "gate", "--worktree", l.work)).toMatchObject({ green: true });
    expect(await dl(l, red(2), "gate", "--worktree", l.work)).toMatchObject({ green: false, next: "red" });
    await dl(l, t(3), "escalate", "--why", "проверить");
    expect(await dl(l, t(4), "owner", "--text", "стоп")).toMatchObject({ next: "stop" });
    expect(await dl(l, t(5), "owner", "--text", "продолжить")).toMatchObject({ next: "gate" });
  });
});

// A gap the fixer of the red gate or of the rebase finds goes to the state, as one of an answer does:
// the final report checks every gap of the loop against PLAN.md.
describe.concurrent("dev-loop gate, the gaps of the fixer", { timeout: 60_000 }, () => {
  it("keeps the gaps of the fixers of verify-red and rebase in the state", async () => {
    const l = await loop();
    await dl(l, t(0), "init", "--pr", "9", "--task", "S0-99", "--branch", BRANCH);
    expect(await dl(l, red(1), "gate", "--worktree", l.work)).toMatchObject({ green: false, next: "red" });
    for (const [job, gaps] of [["verify-red", ["G-07"]], ["rebase", ["G-07", "G-08"]]] as const) {
      const brief = (await dl(l, t(2), "brief", "fixer", "--worktree", l.work, "--job", job, "--log", join(l.dir, "verify.log"))).brief as string;
      out(brief, { status: "done", head: await head(l), answers: [], gaps });
      expect(await dl(l, t(3), "check", outOf(brief))).toMatchObject({ ok: true });
    }
    expect(read(join(l.dir, "state.json")).gaps).toEqual(["G-07", "G-08"]);
  });
});
