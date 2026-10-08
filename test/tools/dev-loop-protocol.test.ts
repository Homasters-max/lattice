// A finding names the item of CONVENTIONS.md it rests on — `CONVENTIONS §N.M` (plan/dev-loop.md, S0-50):
// the protocol reads the items of CONVENTIONS.md in the worktree of the agent and accepts a reference to
// one of them, and refuses a reference to an item that is not there or to a whole section.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tool = join(import.meta.dirname, "../../plan/tools/dev-loop.mjs");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const CONVENTIONS = ["# C", "", "## 1. Data", "", "### §1.1 One", "Область: `src/**`", "", "Text.", "", "### §1.3 Three", "Область: `test/**`", ""].join("\n");
const HEAD = "a".repeat(40);

/** The errors of `dl check` for the output of a standards reviewer with these findings, in a worktree with this CONVENTIONS.md. */
function errors(findings: readonly object[], conventions: string | null = CONVENTIONS): string[] {
  const dir = mkdtempSync(join(tmpdir(), "dl-protocol-"));
  dirs.push(dir);
  if (conventions !== null) writeFileSync(join(dir, "CONVENTIONS.md"), conventions);
  const brief = { role: "reviewer", axis: "standards", job: "full", head: HEAD, worktree: dir, findings: [], disputed: [] };
  writeFileSync(join(dir, "r.in.json"), JSON.stringify(brief));
  writeFileSync(join(dir, "r.out.json"), JSON.stringify({ axis: "standards", head: HEAD, summary: "checked", statuses: [], findings }));
  return (JSON.parse(execFileSync(process.execPath, [tool, "check", join(dir, "r.out.json")], { encoding: "utf8" })) as { errors: string[] }).errors;
}

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
