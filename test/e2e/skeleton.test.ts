// SL-05: the walking skeleton — one thin change unit through every seam:
// command → `land --dry-run` with a rejection carrying its rule ID and fixture
// → `land` → `append` with its delta → a question to the read view.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assemble, type Assembled, type Config, type View } from "../../src/assembly/index.js";
import { run } from "../../src/cli/run.js";
import { hashRecord, type JsonValue } from "../../src/kernel/index.js";
import { proposalHash, readProposal } from "../../src/ledger/index.js";

const fixtures = join(import.meta.dirname, "../fixtures/KR-06");
const proposalOf = (file: string) => (JSON.parse(readFileSync(join(fixtures, file), "utf8")) as { input: { proposal: JsonValue } }).input.proposal;
const bad = proposalOf("trigger/entity-id-uppercase.json");
const good = proposalOf("pass/entity-id.json");
const AT = "2026-10-06T12:30:00.000000Z";

function approve(proposal: JsonValue, request: string) {
  const read = readProposal(proposal);
  if (!read.ok) throw new Error("bug: the fixture proposal has the form of LG-09");
  return { verb: "approve" as const, target: proposalHash(read.value), identity: "owner", uri: `fixture:${request}`, at: AT, verified: true };
}

const configIn = (dir: string): Config => ({
  store: { adapter: "jsonl" },
  git: {
    adapter: "fixture",
    dir,
    branches: {
      main: { files: { "README.md": "demo\n" } },
      "cr/bad": { from: "main", files: { "store/proposals/cr-bad.json": JSON.stringify(bad) } },
      "cr/good": { from: "main", files: { "store/proposals/cr-good.json": JSON.stringify(good) } },
    },
  },
  acts: { adapter: "fixture", acts: { "cr/bad": [approve(bad, "cr/bad")], "cr/good": [approve(good, "cr/good")] } },
  clock: { adapter: "fixed", at: AT },
  ids: { adapter: "counter" },
});

async function lattice(assembled: Assembled, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (t) => out.push(t), err: (t) => err.push(t), assembled });
  return { code, out: out.join(""), err: err.join("") };
}

async function viewOf(assembled: Assembled): Promise<View> {
  const view = await assembled.view();
  if (!view.ok) throw new Error(`bug: the store at the tail of main does not open: ${JSON.stringify(view.rejections)}`);
  return view.value;
}

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lattice-e2e-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("walking skeleton (SL-05)", () => {
  it("SL-05: dry run refuses with KR-06, the fixed proposal lands in git, and the read view answers", async () => {
    const assembled = assemble(configIn(dir));

    const refused = await lattice(assembled, "land", "cr/bad", "--dry-run");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('KR-06 at /id (intent "Demo/Hello")');
    expect((await viewOf(assembled)).current("demo/hello")).toBeNull();

    const checked = await lattice(assembled, "land", "cr/good", "--dry-run");
    expect([checked.code, checked.out]).toEqual([0, "dry run: commit 1 would land 2 records\n"]);
    expect((await viewOf(assembled)).seq).toBe(0);

    const landed = await lattice(assembled, "land", "cr/good");
    expect([landed.code, landed.out]).toEqual([0, "landed: commit 1 with 2 records\n"]);

    // The view opens the store of the tail of main: the commit is in git.
    const view = await viewOf(assembled);
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
