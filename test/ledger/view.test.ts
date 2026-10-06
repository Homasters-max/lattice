// The read view runtime and capabilities import (`ledger/view`, ST-01): the
// questions of View and nothing else — rows are never seen by them (LG-38).
import { describe, expect, it } from "vitest";
import { createView } from "../../src/ledger/view.js";

describe("the read view of runtime and capabilities (LG-38)", () => {
  it("LG-38: createView answers the questions of View and holds no row at run time", () => {
    const view = createView(0, []);
    expect(["row" in view, view.seq, view.current("demo/a")]).toEqual([false, 0, null]);
  });
});
