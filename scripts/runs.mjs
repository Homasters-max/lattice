// runs: the records of the runs of test sets (S0-43) — what `npm run prove` proved, under a key over the inputs of a
// test set. A record is .lattice/verify-runs/<key>.json in the owner's working copy: from a worktree, the copy of its
// common git dir (`git rev-parse --git-common-dir`), so every worktree of the loop finds what another proved.
// Only scripts/prove.mjs writes them, whoever runs it — the executor, the fixer or dl gate; dl gate takes from them what
// the head needs no run for, the brief verify-red gets the records of the red test sets, dl start removes those older
// than RUNS_DAYS. A record:
//   {test_set, code, knowledge, tools, environment: {os, node, git}, seed, outcome: "ok" | "failed" | "budget-exceeded",
//    failed: ["<file> > <test>" | "step: <name>" | …], ms, head, at}
// code, knowledge and tools are the hashes of the input of the test set (scripts/prove.mjs): its code, docs/design, the
// config of a run with the lockfile; environment — the platform and the major versions of node and git. The key is the
// hash of these five: the same inputs on the same environment give the same key.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Records older than this many days dl start removes. */
export const RUNS_DAYS = 30;
const DAY_MS = 86_400_000;

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The folder of the records for the repository at `dir`: .lattice/verify-runs of the working copy of its common git dir. */
export const runsDir = (dir) => join(dirname(resolve(dir, git(dir, "rev-parse", "--git-common-dir"))), ".lattice", "verify-runs");

/** The environment of a run: the platform and the major versions of node and git. */
export function environment() {
  const major = (version) => Number(/(\d+)\./.exec(version)?.[1] ?? 0);
  return { os: process.platform, node: major(process.versions.node), git: major(git(".", "--version")) };
}

/** The key of a record: the hash of its test set, its inputs and its environment. */
export function keyOf({ test_set, code, knowledge, tools, environment: { os, node, git: g } }) {
  return createHash("sha256").update(JSON.stringify([test_set, code, knowledge, tools, os, node, g])).digest("hex");
}

/** The record of `key` in the folder `runs`, or null. */
export function readRun(runs, key) {
  try {
    return JSON.parse(readFileSync(join(runs, `${key}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Writes `record` under its key — through a file of its own and a rename, so a reader never meets half of it; → the key. */
export function writeRun(runs, record) {
  const key = keyOf(record);
  mkdirSync(runs, { recursive: true });
  const part = join(runs, `${key}.${process.pid}.part`);
  writeFileSync(part, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(part, join(runs, `${key}.json`));
  return key;
}

/** Removes from `runs` the records whose `at` is more than `days` before `now` (ISO), and those without a readable `at`; → their number. */
export function pruneRuns(runs, now, days = RUNS_DAYS) {
  if (!existsSync(runs)) return 0;
  let removed = 0;
  for (const file of readdirSync(runs).filter((f) => f.endsWith(".json"))) {
    const at = Date.parse(readRun(runs, file.slice(0, -".json".length))?.at ?? "");
    if (Number.isNaN(at) || Date.parse(now) - at > days * DAY_MS) {
      rmSync(join(runs, file), { force: true });
      removed += 1;
    }
  }
  return removed;
}
