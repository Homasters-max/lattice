// The test assembly (plan/closure-check.md, the bypass class of acts): the adapters that
// exist for tests — `git-fixture`, `acts-fixture`, `clock-fixed`, `ids-counter`
// (ST-07, TR-14) — reach the working code only from here: the whole assembly
// for the commands, or the ports of landing for the tests of the ledger. No file
// of `src/` imports them (test/structure, ST-07).
import { createActsFixture, type ActsFixtureOptions } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed, type ClockFixedOptions } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter, type IdsCounterOptions } from "../../src/adapters/ids-counter/index.js";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import { assemble, type Assembly } from "../../src/assembly/index.js";
import type { LandingPorts, Worktree } from "../../src/ledger/index.js";
import { deepFreeze } from "./deep-freeze.js";

export type FixtureConfig = {
  readonly git: GitFixtureOptions;
  readonly acts: ActsFixtureOptions;
  readonly clock: ClockFixedOptions;
  readonly ids?: IdsCounterOptions;
};

/** The ports of the adapters for tests, as `assemble` takes them. */
const portsOf = (config: FixtureConfig) => ({
  git: createGitFixture(config.git),
  acts: createActsFixture(config.acts),
  clock: createClockFixed(config.clock),
  ids: createIdsCounter(config.ids),
});

export function assembleForTests(config: FixtureConfig): Assembly {
  return assemble(portsOf(config));
}

/**
 * The ports of landing for the tests of the ledger: those of `assembleForTests` and the `jsonl` store on every
 * worktree, as `assemble` wires it (LG-23), frozen; `over` replaces some of them.
 */
export function landingPortsForTests(config: FixtureConfig, over: Partial<LandingPorts> = {}): LandingPorts {
  return deepFreeze({ ...portsOf(config), openStore: (w: Worktree) => createStoreJsonl({ dir: w.dir }), ...over });
}
