// assembly (ST-01): builds landing from configuration; the only module that
// imports adapters (ST-06). The configuration of S0-03 names the test adapters
// and the `jsonl` store: the working adapters and reading `store/lattice.json`
// arrive with S0-11, S0-19, S0-20 and S0-23, and then fixtures stay in the
// test assembly (plan/closure-check.md).
import { createActsFixture, type ActsFixtureOptions } from "../adapters/acts-fixture/index.js";
import { createClockFixed, type ClockFixedOptions } from "../adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../adapters/git-fixture/index.js";
import { createIdsCounter, type IdsCounterOptions } from "../adapters/ids-counter/index.js";
import { createStoreJsonl } from "../adapters/store-jsonl/index.js";
import type { Result } from "../kernel/index.js";
import { land, tailView, type LandingOutcome, type LandingPorts, type LandOptions, type View } from "../ledger/index.js";

export type { Rejection, Result } from "../kernel/index.js";
export type { LandingOutcome, LandOptions, View };

export type Config = {
  readonly store: { readonly adapter: "jsonl" };
  readonly git: { readonly adapter: "fixture" } & GitFixtureOptions;
  readonly acts: { readonly adapter: "fixture" } & ActsFixtureOptions;
  readonly clock: { readonly adapter: "fixed" } & ClockFixedOptions;
  readonly ids: { readonly adapter: "counter" } & IdsCounterOptions;
};

/** What the commands reach: landing and the read view at the tail of `main`. */
export interface Assembled {
  readonly land: (request: string, options: LandOptions) => Promise<LandingOutcome>;
  readonly view: () => Promise<Result<View>>;
}

function portsOf(config: Config): LandingPorts {
  return {
    git: createGitFixture(config.git),
    acts: createActsFixture(config.acts),
    openStore: (worktree) => createStoreJsonl({ dir: worktree.dir }),
    clock: createClockFixed(config.clock),
    ids: createIdsCounter(config.ids),
  };
}

export function assemble(config: Config): Assembled {
  const ports = portsOf(config);
  return { land: (request, options) => land(ports, request, options), view: () => tailView(ports) };
}
