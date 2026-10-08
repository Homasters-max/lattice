// ST-17: the coverage audit refuses a registered rule ID without both fixture
// folders, a fixture folder that is not a registered rule ID of the design and
// a row of checks.ts with a rule ID it enforces but no trigger or pass case run
// through that row; the last case runs the audit over this repository.
import { describe, expect, it } from "vitest";
import { CHECKS } from "./checks.js";
import { auditCoverage, designRuleIds, type FixtureFolder } from "./coverage.js";
import { loadDesign, loadFolders, loadRegistered } from "./load.js";

const ok = (name: string, check = "c") => ({ name, data: { check, input: {} } });
const folder = (name: string, over: Partial<FixtureFolder> = {}): FixtureFolder => ({
  name,
  trigger: [ok("bad-id.json")],
  pass: [ok("good-id.json")],
  ...over,
});
const audit = (registered: string[], folders: FixtureFolder[], design = ["KR-06", "KR-10"], checks: { [check: string]: string[] } = {}) =>
  auditCoverage({ registered: new Set(registered), folders, design: new Set(design), checks });

describe("rule fixture coverage", () => {
  it("ST-17: passes when every registered rule has trigger and pass cases", () => {
    expect(audit(["KR-06"], [folder("KR-06")])).toEqual([]);
  });

  it("ST-17: refuses a registered rule without a fixture folder", () => {
    expect(audit(["KR-06", "KR-10"], [folder("KR-06")])).toEqual(["KR-10: no folder test/fixtures/KR-10/"]);
  });

  it("ST-17: refuses a registered rule without trigger cases", () => {
    expect(audit(["KR-06"], [folder("KR-06", { trigger: null })])).toEqual(["KR-06: no trigger/ cases"]);
    expect(audit(["KR-06"], [folder("KR-06", { trigger: [] })])).toEqual(["KR-06: no trigger/ cases"]);
  });

  it("ST-17: refuses a registered rule without pass cases", () => {
    expect(audit(["KR-06"], [folder("KR-06", { pass: [] })])).toEqual(["KR-06: no pass/ cases"]);
  });

  it("ST-17: refuses a folder that is not a rule ID of the design", () => {
    expect(audit([], [folder("KR-99")])).toEqual(["KR-99: not a rule ID defined in docs/design"]);
    expect(audit([], [folder("notes")])).toEqual(["notes: not a rule ID defined in docs/design"]);
  });

  it("ST-17: refuses a folder of a rule no registry declares", () => {
    expect(audit([], [folder("KR-10")])).toEqual(["KR-10: no registry src/**/rules.ts declares it"]);
  });

  it("ST-17: refuses a registered ID the design does not define", () => {
    expect(audit(["KR-99"], [folder("KR-99")])).toEqual([
      "KR-99: not a rule ID defined in docs/design",
    ]);
  });

  it("ST-17: refuses a case that is not a .json file or does not parse", () => {
    const f = folder("KR-06", { pass: [ok("good.json"), ok("notes.md"), { name: "broken.json", data: undefined }] });
    expect(audit(["KR-06"], [f])).toEqual([
      "KR-06/pass/broken.json: not valid JSON",
      "KR-06/pass/notes.md: a case is a .json file",
    ]);
  });

  it("ST-17, RM-01: reads rule IDs as the codec reads clauses — table rows in every section, not prose, Z-blocks or mentions", () => {
    const md = "# Doc\n\nKR-Z01. Prose about KR-03.\n\n| ID | Rule |\n|---|---|\n| KR-01 | One, see KR-02. |\n| KR-02 | Two. |\n\n## Part\n\n| ID | Rule |\n|---|---|\n| KR-04 | Four. |\n";
    expect([...designRuleIds([{ name: "doc.md", bytes: new TextEncoder().encode(md) }])].sort()).toEqual(["KR-01", "KR-02", "KR-04"]);
  });

  it("LG-42: a document of the design the codec refuses fails the audit, named with its rejections", () => {
    expect(() => designRuleIds([{ name: "doc.md", bytes: new TextEncoder().encode("| KR-01 | One. |\n") }])).toThrow(/doc\.md: LG-42 at \/doc\.md\/1/);
  });

  it("ST-17: holds for this repository", async () => {
    const design = designRuleIds(loadDesign());
    expect(design.has("ST-17")).toBe(true);
    const registered = await loadRegistered();
    const checks = Object.fromEntries(Object.entries(CHECKS).map(([name, check]) => [name, check.enforces]));
    expect(auditCoverage({ registered, folders: loadFolders(), design, checks })).toEqual([]);
  });
});

describe("rule fixture coverage, by row of checks.ts", () => {
  it("ST-17: passes when every rule ID of every row of checks.ts has a trigger and a pass case through that row", () => {
    const folders = [folder("KR-06", { trigger: [ok("bad-c.json"), ok("bad-d.json", "d")], pass: [ok("good-c.json"), ok("good-d.json", "d")] }), folder("KR-10")];
    expect(audit(["KR-06", "KR-10"], folders, undefined, { c: ["KR-06", "KR-10"], d: ["KR-06"] })).toEqual([]);
  });

  it("ST-17: refuses a row of checks.ts with a rule ID no trigger or pass case runs through it, naming the pair", () => {
    const folders = [folder("KR-06", { trigger: [ok("bad-c.json"), ok("bad-d.json", "d")] }), folder("KR-10", { pass: [ok("good-d.json", "d")] })];
    expect(audit(["KR-06", "KR-10"], folders, undefined, { c: ["KR-06", "KR-10"], d: ["KR-06", "KR-10"] })).toEqual([
      'KR-06 × check "d": no pass/ case runs through it',
      'KR-10 × check "c": no pass/ case runs through it',
      'KR-10 × check "d": no trigger/ case runs through it',
    ]);
  });

  it("ST-17: refuses a row of checks.ts with a rule ID that has no fixture folder, naming the pair", () => {
    expect(audit(["KR-06"], [folder("KR-06")], undefined, { c: ["KR-06", "KR-10"] })).toEqual([
      'KR-10 × check "c": no pass/ case runs through it',
      'KR-10 × check "c": no trigger/ case runs through it',
    ]);
  });
});
