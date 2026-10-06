// ST-17: the coverage audit refuses a registered rule ID without both fixture
// folders and a fixture folder that is not a registered rule ID of the design;
// the last case runs the audit over this repository.
import { describe, expect, it } from "vitest";
import { auditCoverage, designRuleIds, type FixtureFolder } from "./coverage.js";
import { loadDesignTexts, loadFolders, loadRegistered } from "./load.js";

const ok = (name: string) => ({ name, data: { check: "c", input: {} } });
const folder = (name: string, over: Partial<FixtureFolder> = {}): FixtureFolder => ({
  name,
  trigger: [ok("bad-id.json")],
  pass: [ok("good-id.json")],
  ...over,
});
const audit = (registered: string[], folders: FixtureFolder[], design = ["KR-06", "KR-10"]) =>
  auditCoverage({ registered: new Set(registered), folders, design: new Set(design) });

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

  it("ST-17: reads rule IDs from table rows, not from prose, Z-blocks or mentions", () => {
    const md = "KR-Z01. Prose about KR-03.\n\n| ID | Rule |\n|---|---|\n| KR-01 | One, see KR-02. |\n| KR-02 | Two. |\n";
    expect([...designRuleIds([md])].sort()).toEqual(["KR-01", "KR-02"]);
  });

  it("ST-17: holds for this repository", async () => {
    const design = designRuleIds(loadDesignTexts());
    expect(design.has("ST-17")).toBe(true);
    const registered = await loadRegistered();
    expect(auditCoverage({ registered, folders: loadFolders(), design })).toEqual([]);
  });
});
