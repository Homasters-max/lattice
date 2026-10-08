// plan-check holds the board and the task files of the plan together; these cases run it on a copy of
// this repository's plan, design and CONVENTIONS.md and show that a done task needs every item of «Готово, когда»
// marked and that every item of CONVENTIONS.md has its number and area and every reference names one.
import { afterEach, describe, expect, it } from "vitest";
import { knowledge, owned, scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const tool = program("plan/tools/plan-check.mjs");
const task = "plan/phases/S0-kernel-ledger/tasks/S0-34-worktree-release.md";
const board = "plan/phases/S0-kernel-ledger/STATUS.md";
const dirs: Scratch[] = [];

function copy(): Scratch {
  const dir = scratch("plan-check-");
  dirs.push(dir);
  knowledge.copy("", dir.path("docs/design"));
  for (const part of ["plan", "CONVENTIONS.md"]) owned.copy(part, dir.path(part));
  return dir;
}

function edit(dir: Scratch, path: string, change: (text: string) => string): void {
  dir.write(path, change(dir.text(path)));
}

function check(dir: Scratch): { status: number | null; out: string } {
  const run = tool.run(["--root", dir.dir]);
  return { status: run.status, out: run.stdout };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) dir.remove();
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
  it("refuses an item without a number or without its area", () => {
    const dir = copy();
    edit(dir, "CONVENTIONS.md", (t) => `${t}\n## 99. Extra\n\n### No number\nОбласть: \`src/**\`\n\n### §99.1 No area\n\nText.\n`);
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: пункт без номера — «### §N\.M Название»/);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: у §99\.1 нет строки «Область:» с путями в обратных кавычках/);
  });

  it("refuses the first item of a section numbered for another section", () => {
    const dir = copy();
    edit(dir, "CONVENTIONS.md", (t) => `${t}\n## 99. Extra\n\n### §1.1 Elsewhere\nОбласть: \`src/**\`\n`);
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: §1\.1 в разделе 99 — номер пункта начинается с номера раздела/);
  });

  it("refuses an item numbered below the one before it in its section", () => {
    const dir = copy();
    edit(dir, "CONVENTIONS.md", (t) => `${t}\n## 99. Extra\n\n### §99.2 Second\nОбласть: \`src/**\`\n\n### §99.1 First\nОбласть: \`src/**\`\n`);
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/✗ CONVENTIONS\.md:\d+: §99\.1 после §99\.2 — номер растёт внутри раздела/);
  });
});

describe("plan-check, references to the items of CONVENTIONS.md (S0-50)", () => {
  it("refuses a reference to an item that is not there or to a whole section, and accepts one to an item", () => {
    const dir = copy();
    dir.write("src/kernel/x.ts", "// sorted (CONVENTIONS.md §5.2, §99.9)\n// and CONVENTIONS §3\n");
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain("✗ src/kernel/x.ts:1: CONVENTIONS §99.9 — нет такого пункта; ссылка называет пункт §N.M");
    expect(r.out).toContain("✗ src/kernel/x.ts:2: CONVENTIONS §3 — нет такого пункта; ссылка называет пункт §N.M");
    expect(r.out).not.toContain("§5.2 — нет");
  });

  // Each place plan-check reads for references: code, tests, scripts and the process — AGENTS.md, the protocol,
  // the closure check, the skills — and CONVENTIONS.md itself.
  it.each([
    "AGENTS.md",
    "CONVENTIONS.md",
    "plan/dev-loop.md",
    "plan/closure-check.md",
    ".claude/skills/plan-task/SKILL.md",
    "src/kernel/x.ts",
    "test/kernel/x.test.ts",
    "scripts/x.mjs",
  ])("refuses a reference to an item that is not there from %s", (path) => {
    const dir = copy();
    const line = append(dir, path, "see CONVENTIONS §99.9");
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.out).toContain(`✗ ${path}:${line}: CONVENTIONS §99.9 — нет такого пункта`);
  });

  // Task files and PLAN.md of the phases are history; test/tools holds the data of the tools' tests;
  // .claude/worktrees holds the working copies of other sessions, not this repository.
  it.each([
    "plan/phases/S0-kernel-ledger/tasks/S0-34-worktree-release.md",
    "plan/phases/S0-kernel-ledger/PLAN.md",
    "test/tools/x.test.ts",
    ".claude/worktrees/w/src/kernel/x.ts",
  ])(
    "does not read references from %s",
    (path) => {
      const dir = copy();
      append(dir, path, "see CONVENTIONS §99.9");
      const r = check(dir);
      expect(r.status).toBe(0);
      expect(r.out).not.toContain("§99.9");
    },
  );
});

/** Appends a line to the file of the copy, made if it is not there; the number of the line written. */
function append(dir: Scratch, path: string, text: string): number {
  const before = dir.exists(path) ? dir.text(path).replace(/\n?$/, "\n") : "";
  dir.write(path, `${before}${text}\n`);
  return before.split("\n").length;
}
