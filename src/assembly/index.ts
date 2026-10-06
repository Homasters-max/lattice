// assembly (ST-01): builds landing from configuration; the only module that
// imports adapters (ST-06). The configuration of S0-03 names only the test
// adapters: the working ones and reading `store/lattice.json` arrive with
// S0-11, S0-19, S0-20 and S0-23, and then fixtures stay in the test assembly
// (plan/closure-check.md).
import { createActsFixture, type ActsFixtureOptions } from "../adapters/acts-fixture/index.js";
import { createClockFixed, type ClockFixedOptions } from "../adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../adapters/git-fixture/index.js";
import { createIdsCounter, type IdsCounterOptions } from "../adapters/ids-counter/index.js";
import { createStoreMemory } from "../adapters/store-memory/index.js";
import { land, readView, type LandingOutcome, type LandingPorts, type LandOptions, type View } from "../ledger/index.js";

export type { Rejection } from "../kernel/index.js";
export type { LandingOutcome, LandOptions, View };

export type Config = {
  readonly store: { readonly adapter: "memory" };
  readonly git: { readonly adapter: "fixture" } & GitFixtureOptions;
  readonly acts: { readonly adapter: "fixture" } & ActsFixtureOptions;
  readonly clock: { readonly adapter: "fixed" } & ClockFixedOptions;
  readonly ids: { readonly adapter: "counter" } & IdsCounterOptions;
};

/** What the commands reach: landing and the read view of the store. */
export interface Assembled {
  readonly land: (request: string, options: LandOptions) => Promise<LandingOutcome>;
  readonly view: () => Promise<View>;
}

function portsOf(config: Config): LandingPorts {
  return {
    store: createStoreMemory(),
    git: createGitFixture(config.git),
    acts: createActsFixture(config.acts),
    clock: createClockFixed(config.clock),
    ids: createIdsCounter(config.ids),
  };
}

export function assemble(config: Config): Assembled {
  const ports = portsOf(config);
  return { land: (request, options) => land(ports, request, options), view: () => readView(ports.store) };
}
