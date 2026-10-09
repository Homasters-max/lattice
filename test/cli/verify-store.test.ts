// `lattice verify-store <path>` (RT-32, RT-Z03): opens the `jsonl` store of a
// directory, verifies its chain and signatures (LG-05) and the rebuild of its
// rows (LG-37), and prints the outcome — the counts, or the rejections one per
// line; exit 0 verified, 1 refused, 2 not run.
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";
import { commitLine, KNOWLEDGE, type Commit } from "../../src/ledger/index.js";
import { landedChain, recordedChain } from "../support/chain.js";
import { deepFreeze } from "../support/deep-freeze.js";
import { scratch, type Scratch } from "../support/files.js";
import { note, proposalOf, TYPES } from "../support/notes.js";

const dirs: Scratch[] = [];
afterAll(() => dirs.forEach((d) => d.remove()));

const PROPOSALS = [proposalOf(...TYPES, note("demo/a")), proposalOf(note("demo/b", { refs: ["demo/a"] }))];

/** A directory holding the `jsonl` store of these commits. */
function storeOf(commits: readonly Commit[]): Scratch {
  const dir = scratch("lattice-verify-");
  dirs.push(dir);
  dir.write(KNOWLEDGE, Uint8Array.from(commits.flatMap((c) => [...commitLine(c)])));
  return dir;
}

async function lattice(cwd: string, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(deepFreeze(argv), { out: (t) => out.push(t), err: (t) => err.push(t), assembled: null, cwd });
  return { code, out: out.join(""), err: err.join("") };
}

describe("lattice verify-store (RT-32)", () => {
  it("RT-32, LG-37: verifies a jsonl store and prints its commits and rows; no store configured is needed", async () => {
    const dir = storeOf(recordedChain(PROPOSALS));
    const out = await lattice(".", "verify-store", dir.dir);
    expect([out.code, out.err]).toEqual([0, ""]);
    expect(out.out).toMatch(/^verified: 2 commits — chain, signatures and a rebuild of \d+ rows \(LG-05, LG-37\)\n$/);
    // A relative path is a path from the folder it runs in.
    expect((await lattice(dir.dir, "verify-store", ".")).out).toBe(out.out);
  });

  it("LG-06: prints the rejections of a store whose commits no recorded land session signed, exit 1", async () => {
    const out = await lattice(".", "verify-store", storeOf(landedChain(PROPOSALS)).dir);
    expect([out.code, out.err, out.out.split("\n").map((l) => l.split(":")[0])]).toEqual([1, "", ["rejections", "LG-06 at /store/knowledge.jsonl/1/sig", "LG-06 at /store/knowledge.jsonl/2/sig", ""]]);
  });

  it("RT-32: a directory without store/knowledge.jsonl holds no store: exit 2", async () => {
    const empty = scratch("lattice-verify-");
    dirs.push(empty);
    const out = await lattice(".", "verify-store", empty.dir);
    expect([out.code, out.out, out.err]).toEqual([2, "", `lattice verify-store: no store at ${empty.dir} — no store/knowledge.jsonl (LG-50)\n`]);
  });

  it("RT-32: asks for one path", async () => {
    for (const args of [[], ["a", "b"], ["--all"]]) expect(await lattice(".", "verify-store", ...args)).toEqual({ code: 2, out: "", err: "usage: lattice verify-store <path>\n" });
  });
});
