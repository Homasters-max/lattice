// ST-17, LG-17: a trigger case is refused by its check with the folder's rule
// ID at the expected path; a pass case is accepted. The last case runs every
// fixture of this repository through the table of hard checks.
import { describe, expect, it } from "vitest";
import { CHECKS } from "./checks.js";
import { loadFolders } from "./load.js";
import { runFixture, type CheckOutcome, type FixtureCheck } from "./run.js";

const refuse = (rule: string, path: string, intent: string | null = null): CheckOutcome => ({
  ok: false,
  rejections: [{ rule, path, intent }],
});
const id: FixtureCheck = {
  enforces: ["KR-06"],
  run: (input) => (input === "bad" ? refuse("KR-06", "/id", "x") : { ok: true }),
};
const checks = { id };
const trigger = (over: object = {}) => ({ check: "id", input: "bad", expect: { rule: "KR-06", path: "/id" }, ...over });

describe("rule fixture runner", () => {
  it("passes a trigger refused with its rule at its path and a pass accepted", () => {
    expect(runFixture(checks, "KR-06", "trigger", trigger())).toBeNull();
    expect(runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/id", intent: "x" } }))).toBeNull();
    expect(runFixture(checks, "KR-06", "pass", { check: "id", input: "good" })).toBeNull();
  });

  it("refuses a case whose check is not in the table", () => {
    expect(runFixture(checks, "KR-06", "pass", { check: "nope", input: 1 })).toBe('check "nope" is not in test/fixtures/checks.ts');
    expect(runFixture(checks, "KR-06", "pass", { input: 1 })).toBe("a case names its check and has an input");
    expect(runFixture(checks, "KR-06", "pass", { check: "id" })).toBe("a case names its check and has an input");
  });

  it("refuses a case whose check does not enforce the folder's rule", () => {
    expect(runFixture(checks, "KR-10", "pass", { check: "id", input: "good" })).toBe('check "id" does not enforce KR-10');
  });

  it("refuses a trigger whose expect is missing or names another rule", () => {
    expect(runFixture(checks, "KR-06", "trigger", trigger({ expect: undefined }))).toBe(
      "a trigger expects {rule, path} with the folder's rule",
    );
    expect(runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-10", path: "/id" } }))).toBe(
      "a trigger expects {rule, path} with the folder's rule",
    );
  });

  it("refuses a pass case that carries an expect", () => {
    expect(runFixture(checks, "KR-06", "pass", { check: "id", input: "good", expect: {} })).toBe("a pass case has no expect");
  });

  it("refuses a trigger the check accepts or refuses elsewhere", () => {
    expect(runFixture(checks, "KR-06", "trigger", trigger({ input: "good" }))).toBe("accepted; expected KR-06 at /id");
    expect(runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/at" } }))).toBe(
      'no rejection KR-06 at /at; got KR-06 at /id (intent "x")',
    );
    expect(runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/id", intent: "y" } }))).toBe(
      'no rejection KR-06 at /id (intent "y"); got KR-06 at /id (intent "x")',
    );
  });

  it("refuses a pass case the check refuses", () => {
    expect(runFixture(checks, "KR-06", "pass", { check: "id", input: "bad" })).toBe('refused: KR-06 at /id (intent "x")');
  });

  it("holds for every fixture of this repository", () => {
    const problems = loadFolders().flatMap((f) =>
      (["trigger", "pass"] as const).flatMap((kind) =>
        (f[kind] ?? []).map((c) => {
          const p = runFixture(CHECKS, f.name, kind, c.data);
          return p === null ? null : `${f.name}/${kind}/${c.name}: ${p}`;
        }),
      ),
    );
    expect(problems.filter((p) => p !== null)).toEqual([]);
  });
});
