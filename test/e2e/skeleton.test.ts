// SL-05: the walking skeleton — one thin change unit through every seam:
// command → `land --dry-run` with a rejection carrying its rule ID and fixture
// → `land` → `append` with its delta → a question to the read view.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assemble, type Assembled, type Config } from "../../src/assembly/index.js";
import { run } from "../../src/cli/run.js";
import { hashRecord, type JsonValue } from "../../src/kernel/index.js";
import { proposalHash, readProposal } from "../../src/ledger/index.js";

const fixtures = join(import.meta.dirname, "../fixtures/KR-06");
const proposalOf = (file: string) => (JSON.parse(readFileSync(join(fixtures, file), "utf8")) as { input: { proposal: JsonValue } }).input.proposal;
const bad = proposalOf("trigger/entity-id-uppercase.json");
const good = proposalOf("pass/entity-id.json");
const AT = "2026-10-06T12:30:00.000000Z";

const approve = (proposal: JsonValue, request: string) => ({
  verb: "approve" as const,
  target: proposalHash(readProposal(proposal)),
  identity: "owner",
  uri: `fixture:${request}`,
  at: AT,
  verified: true,
});

const config: Config = {
  store: { adapter: "memory" },
  git: {
    adapter: "fixture",
    branches: {
      main: { "README.md": "demo\n" },
      "cr/bad": { "store/proposals/cr-bad.json": JSON.stringify(bad) },
      "cr/good": { "store/proposals/cr-good.json": JSON.stringify(good) },
    },
  },
  acts: { adapter: "fixture", acts: { "cr/bad": [approve(bad, "cr/bad")], "cr/good": [approve(good, "cr/good")] } },
  clock: { adapter: "fixed", at: AT },
  ids: { adapter: "counter" },
};

async function lattice(assembled: Assembled, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (t) => out.push(t), err: (t) => err.push(t), assembled });
  return { code, out: out.join(""), err: err.join("") };
}

describe("walking skeleton (SL-05)", () => {
  it("SL-05: dry run refuses with KR-06, the fixed proposal lands, and the read view answers", async () => {
    const assembled = assemble(config);

    const refused = await lattice(assembled, "land", "cr/bad", "--dry-run");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('KR-06 at /id (intent "Demo/Hello")');
    expect((await assembled.view()).current("demo/hello")).toBeNull();

    const checked = await lattice(assembled, "land", "cr/good", "--dry-run");
    expect([checked.code, checked.out]).toEqual([0, "dry run: commit 1 would land 2 records\n"]);
    expect((await assembled.view()).seq).toBe(0);

    const landed = await lattice(assembled, "land", "cr/good");
    expect([landed.code, landed.out]).toEqual([0, "landed: commit 1 with 2 records\n"]);

    const view = await assembled.view();
    expect(view.seq).toBe(1);
    expect(view.current("demo/hello")).toEqual({
      id: "demo/hello",
      rev: 1,
      type: "demo/note@1",
      hash: hashRecord("demo/note@1", { text: "hello" }),
      by: "01JB2X00000000000000000SES",
      at: "2026-10-06T12:00:00.000000Z",
      body: { text: "hello" },
    });
    expect(view.current("demo/note")?.type).toBe("core/type@1");
  });
});
