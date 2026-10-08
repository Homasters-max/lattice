// A finding names the item of CONVENTIONS.md it rests on — `CONVENTIONS §N.M` (plan/dev-loop.md, S0-50):
// the protocol reads the items of CONVENTIONS.md in the worktree of the agent and accepts a reference to
// one of them, and refuses a reference to an item that is not there or to a whole section.
import { afterAll, describe, expect, it } from "vitest";
import { scratch, type Scratch } from "../support/files.js";
import { program } from "../support/program.js";

const tool = program("plan/tools/dev-loop.mjs");
const dirs: Scratch[] = [];
afterAll(() => {
  for (const d of dirs) d.remove();
});

const CONVENTIONS = ["# C", "", "## 1. Data", "", "### §1.1 One", "Область: `src/**`", "", "Text.", "", "### §1.3 Three", "Область: `test/**`", ""].join("\n");
const HEAD = "a".repeat(40);

/** The errors of `dl check` for this output of a standards reviewer, in a worktree with this CONVENTIONS.md. */
function checked(out: object, conventions: string | null = CONVENTIONS): string[] {
  const dir = scratch("dl-protocol-");
  dirs.push(dir);
  if (conventions !== null) dir.write("CONVENTIONS.md", conventions);
  const brief = { role: "reviewer", axis: "standards", job: "hunks", head: HEAD, worktree: dir.dir, findings: [], disputed: [] };
  dir.write("r.in.json", JSON.stringify(brief));
  const file = dir.write("r.out.json", JSON.stringify(out));
  return (JSON.parse(tool.run(["check", file]).stdout) as { errors: string[] }).errors;
}

/** The errors of `dl check` for the output of a standards reviewer with these findings. */
const errors = (findings: readonly object[], conventions: string | null = CONVENTIONS): string[] =>
  checked({ axis: "standards", head: HEAD, summary: "checked", statuses: [], findings }, conventions);

const finding = (rule: string) => ({ kind: "rule", rule, where: "src/x.ts:1", quote: "x", text: "y" });

describe("dev-loop protocol, a reference to CONVENTIONS.md", () => {
  it("accepts a finding that names an item of CONVENTIONS.md", () => {
    expect(errors([finding("CONVENTIONS §1.1"), finding("CONVENTIONS §1.3, ST-03")])).toEqual([]);
  });

  it("refuses an item that is not there, a whole section and an item of a worktree without CONVENTIONS.md", () => {
    const missing = (at: number, ref: string) => `findings[${at}].rule: ${ref} — нет такого пункта в CONVENTIONS.md; ссылка — CONVENTIONS §N.M`;
    expect(errors([finding("CONVENTIONS §1.2"), finding("CONVENTIONS §1"), finding("LG-23, CONVENTIONS §2.1")])).toEqual([
      missing(0, "§1.2"),
      missing(1, "§1"),
      missing(2, "§2.1"),
    ]);
    expect(errors([finding("CONVENTIONS §1.1")], null)).toEqual([missing(0, "§1.1")]);
  });

  it("passes an advice that names no item", () => {
    expect(errors([{ ...finding(""), kind: "advice" }])).toEqual([]);
  });
});

// An error of the protocol says what came beside what is needed, and names the fields outside the schema of the role:
// an agent that reads only the expected value takes it for a statement and does not rewrite out.json.
describe("dev-loop protocol, an output outside the schema of its role", () => {
  it("names the fields the schema of the reviewer lacks and what came instead of the fields it needs", () => {
    expect(checked({ head: "", hunks: [], new: [], statuses: [] })).toEqual([
      "лишние поля: hunks, new — схема reviewer в plan/dev-loop.md, «Роли: вход и выход»: axis, head, summary, statuses, findings, context_missing",
      "axis: нет — нужно standards",
      `head: пусто — нужно ${HEAD}`,
      "summary: нет — нужно что проверено, до 800 знаков",
      "findings: нет — нужен список объектов, пустой, если нечего",
    ]);
  });

  it("accepts the five fields of the schema and nothing else", () => {
    expect(checked({ axis: "standards", head: HEAD, summary: "checked", statuses: [], findings: [] })).toEqual([]);
  });
});
