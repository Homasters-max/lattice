// plan-check holds the board and the task files of the plan together; these cases run it on a copy of
// this repository's plan, design and CONVENTIONS.md and show that a done task needs every item of «Готово, когда»
// marked and that every item of CONVENTIONS.md has its number and area and every reference names one.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  for (const part of ["docs/design", "plan", "CONVENTIONS.md"]) cpSync(join(root, part), join(dir, part), { recursive: true });
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

describe("plan-check, the items of CONVENTIONS.md (S0-50)", () => {
  it("refuses an item without a number or without its area, and a number out of its section", () => {
    const dir = copy();
    edit(dir, "CONVENTIONS.md", (t) => `${t}\n## 99. Extra\n\n### No number\nОбласть: \`src/**\`\n\n### §99.1 No area\n\nText.\n\n### §1.1 Elsewhere\nОбласть: \`src/**\`\n`);
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: пункт без номера — «### §N\.M Название»/);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: у §99\.1 нет строки «Область:» с путями в обратных кавычках/);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: §1\.1 — в разделе 99 номер после §99\.1/);
  });

  it("refuses a reference from code, tests and the process to an item that is not there or to a whole section", () => {
    const dir = copy();
    mkdirSync(join(dir, "src/kernel"), { recursive: true });
    writeFileSync(join(dir, "src/kernel/x.ts"), "// sorted (CONVENTIONS.md §5.2, §99.9)\n// and CONVENTIONS §3\n");
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("✗ src/kernel/x.ts:1: CONVENTIONS §99.9 — нет такого пункта; ссылка называет пункт §N.M");
    expect(r.out).toContain("✗ src/kernel/x.ts:2: CONVENTIONS §3 — нет такого пункта; ссылка называет пункт §N.M");
    expect(r.out).not.toContain("§5.2 — нет");
  });
});
