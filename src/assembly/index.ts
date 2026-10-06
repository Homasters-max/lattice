// assembly (ST-01): wires landing and the read view to the ports; the only
// module that imports adapters (ST-06). The store on a worktree is always the
// `jsonl` adapter (LG-23). The working adapters of `git`, `acts`, `clock` and
// `ids` and reading `store/lattice.json` arrive with S0-19, S0-20 and S0-23;
// the adapters for tests are assembled only by tests (test/support/assembly.ts,
// plan/closure-check.md, the bypass class of acts: TR-14…TR-17).
import { createStoreJsonl } from "../adapters/store-jsonl/index.js";
import type { Result } from "../kernel/index.js";
import { land, tailView, type LandingOutcome, type LandingPorts, type LandOptions, type View } from "../ledger/index.js";

export type { Rejection, Result } from "../kernel/index.js";
export type { LandingOutcome, LandOptions, View };

/** The ports assembly is given; it opens the store itself. */
export type Ports = Omit<LandingPorts, "openStore">;

/** What the commands reach: landing and the read view at the tail of `main`. */
export interface Assembly {
  readonly land: (request: string, options: LandOptions) => Promise<LandingOutcome>;
  readonly view: () => Promise<Result<View>>;
}

export function assemble(ports: Ports): Assembly {
  const all: LandingPorts = { ...ports, openStore: (worktree) => createStoreJsonl({ dir: worktree.dir }) };
  return { land: (request, options) => land(all, request, options), view: () => tailView(all) };
}
