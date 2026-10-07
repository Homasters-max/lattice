// ST-17, LG-17: a trigger case is refused by its check with the folder's rule
// ID at the expected path; a pass case is accepted, whether the check answers
// at once or waits on a port. The last case runs every fixture of this
// repository through the table of hard checks.
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
/** The same check, waiting before it answers, as a check that waits on a port does. */
const waiting: FixtureCheck = { enforces: id.enforces, run: async (input) => id.run(input) };
const checks = { id, waiting };
const trigger = (over: object = {}) => ({ check: "id", input: "bad", expect: { rule: "KR-06", path: "/id" }, ...over });

describe("rule fixture runner", () => {
  it("ST-17: passes a trigger refused with its rule at its path and a pass accepted", async () => {
    expect(await runFixture(checks, "KR-06", "trigger", trigger())).toBeNull();
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/id", intent: "x" } }))).toBeNull();
    expect(await runFixture(checks, "KR-06", "pass", { check: "id", input: "good" })).toBeNull();
  });

  it("ST-17: runs a check that waits as it runs one that answers at once", async () => {
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ check: "waiting" }))).toBeNull();
    expect(await runFixture(checks, "KR-06", "pass", { check: "waiting", input: "good" })).toBeNull();
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ check: "waiting", input: "good" }))).toBe("accepted; expected KR-06 at /id");
    expect(await runFixture(checks, "KR-06", "pass", { check: "waiting", input: "bad" })).toBe('refused: KR-06 at /id (intent "x")');
  });

  it("ST-17: refuses a case whose check is not in the table", async () => {
    expect(await runFixture(checks, "KR-06", "pass", { check: "nope", input: 1 })).toBe('check "nope" is not in test/fixtures/checks.ts');
    expect(await runFixture(checks, "KR-06", "pass", { input: 1 })).toBe("a case names its check and has an input");
    expect(await runFixture(checks, "KR-06", "pass", { check: "id" })).toBe("a case names its check and has an input");
  });

  it("ST-17: refuses a case whose check does not enforce the folder's rule", async () => {
    expect(await runFixture(checks, "KR-10", "pass", { check: "id", input: "good" })).toBe('check "id" does not enforce KR-10');
  });

  it("ST-17: refuses a trigger whose expect is missing or names another rule", async () => {
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ expect: undefined }))).toBe(
      "a trigger expects {rule, path} with the folder's rule",
    );
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-10", path: "/id" } }))).toBe(
      "a trigger expects {rule, path} with the folder's rule",
    );
  });

  it("ST-17: refuses a pass case that carries an expect", async () => {
    expect(await runFixture(checks, "KR-06", "pass", { check: "id", input: "good", expect: {} })).toBe("a pass case has no expect");
  });

  it("ST-17: refuses a trigger the check accepts or refuses elsewhere", async () => {
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ input: "good" }))).toBe("accepted; expected KR-06 at /id");
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/at" } }))).toBe(
      'no rejection KR-06 at /at; got KR-06 at /id (intent "x")',
    );
    expect(await runFixture(checks, "KR-06", "trigger", trigger({ expect: { rule: "KR-06", path: "/id", intent: "y" } }))).toBe(
      'no rejection KR-06 at /id (intent "y"); got KR-06 at /id (intent "x")',
    );
  });

  it("ST-17: refuses a pass case the check refuses", async () => {
    expect(await runFixture(checks, "KR-06", "pass", { check: "id", input: "bad" })).toBe('refused: KR-06 at /id (intent "x")');
  });

});

describe("the rule fixtures of this repository", () => {
  it("ST-17: holds for every fixture of this repository", async () => {
    const cases = loadFolders().flatMap((f) => (["trigger", "pass"] as const).flatMap((kind) => (f[kind] ?? []).map((c) => ({ at: `${f.name}/${kind}/${c.name}`, rule: f.name, kind, data: c.data }))));
    const problems = await Promise.all(
      cases.map(async (c) => {
        const p = await runFixture(CHECKS, c.rule, c.kind, c.data);
        return p === null ? null : `${c.at}: ${p}`;
      }),
    );
    expect(problems.filter((p) => p !== null)).toEqual([]);
  });
});
