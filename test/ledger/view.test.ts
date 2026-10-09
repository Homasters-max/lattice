// The read view runtime and capabilities import (`ledger/view`, ST-01): the
// questions of View and nothing else — rows are never seen by them (LG-38).
import { describe, expect, it } from "vitest";
import { commitLine, openLines } from "../../src/ledger/index.js";
import { createView, type View } from "../../src/ledger/view.js";
import { keyOfLand, landedChain } from "../support/chain.js";
import { note, proposalOf, TYPES } from "../support/notes.js";

/** Every question of the view of S0 about demo/a and demo/b. */
const ask = (v: View) => [
  v.seq,
  v.current("demo/a"),
  v.latest("demo/a"),
  v.revision("demo/b", 1),
  v.referrers("demo/a"),
  v.referrers("demo/a", "cites"),
  v.holder({ namespace: "demo", type: "demo/note", path: "/title", value: "demo/a" }),
  v.standing("demo/a"),
  v.blocks(["demo/note"], ["demo"]),
  v.evidence("sha256:0"),
];

describe("the read view of runtime and capabilities (LG-38)", () => {
  it("LG-38: createView answers the questions of View and holds no row at run time", () => {
    const view = createView(0, []);
    expect(["row" in view, view.seq, view.current("demo/a")]).toEqual([false, 0, null]);
  });

  it("LG-38: createView over the rows of a store answers every question of S0 as the view of the store does", () => {
    const opened = openLines(landedChain([proposalOf(...TYPES, note("demo/a"), note("demo/b", { refs: ["demo/a"] }))]).map(commitLine), keyOfLand);
    if (!opened.ok) throw new Error("bug: a landed chain opens");
    const view = createView(1, opened.value.rows);
    expect(ask(view)).toEqual(ask(opened.value.view));
    expect(["row" in view, view.referrers("demo/a").length]).toEqual([false, 1]);
  });
});
