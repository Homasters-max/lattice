// plan-check holds the board and the task files of the plan together; these cases run it on a copy of
// this repository's plan and design and show that a done task needs every item of «Готово, когда» marked.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const tool = join(root, "plan/tools/plan-check.mjs");
const task = "plan/phases/S0-kernel-ledger/tasks/S0-34-worktree-release.md";
const board = "plan/phases/S0-kernel-ledger/STATUS.md";
const dirs: string[] = [];

function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "plan-check-"));
  dirs.push(dir);
  for (const part of ["docs/design", "plan"]) cpSync(join(root, part), join(dir, part), { recursive: true });
  return dir;
}

function edit(dir: string, path: string, change: (text: string) => string): void {
  writeFileSync(join(dir, path), change(readFileSync(join(dir, path), "utf8")));
}

function check(dir: string): { status: number | null; out: string } {
  const run = spawnSync(process.execPath, [tool, "--root", dir], { encoding: "utf8" });
  return { status: run.status, out: run.stdout };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("plan-check, «Готово, когда» of a done task", () => {
  it("passes the plan of this repository", () => {
    expect(check(copy()).status).toBe(0);
  });

  it("refuses a task done on the board with an item left unmarked", () => {
    const dir = copy();
    edit(dir, task, (t) => t.replace("- [x] `npm run verify` зелёный", "- [ ] `npm run verify` зелёный"));
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("S0-34-worktree-release.md: ✅ на доске, но в «Готово, когда» не отмечено пунктов: 1");
  });

  it("warns of a task marked done in its file but not on the board", () => {
    const dir = copy();
    edit(dir, board, (t) => t.replace("| B | ✅ | [#12](https://github.com/Homasters-max/lattice/pull/12) |", "| B | ⬜ | |"));
    const r = check(dir);
    expect(r.out).toContain("S0-34-worktree-release.md: в «Готово, когда» отмечено 4, а на доске ⬜");
  });
});
