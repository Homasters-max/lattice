// The test assembly (plan/closure-check.md, «acts и права»): the adapters that
// exist for tests — `git-fixture`, `acts-fixture`, `clock-fixed`, `ids-counter`
// (ST-07, TR-14) — reach the working code only from here; no file of `src/`
// imports them (test/structure, ST-07).
import { createActsFixture, type ActsFixtureOptions } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed, type ClockFixedOptions } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter, type IdsCounterOptions } from "../../src/adapters/ids-counter/index.js";
import { assemble, type Assembly } from "../../src/assembly/index.js";

export type FixtureConfig = {
  readonly git: GitFixtureOptions;
  readonly acts: ActsFixtureOptions;
  readonly clock: ClockFixedOptions;
  readonly ids?: IdsCounterOptions;
};

export function assembleForTests(config: FixtureConfig): Assembly {
  return assemble({
    git: createGitFixture(config.git),
    acts: createActsFixture(config.acts),
    clock: createClockFixed(config.clock),
    ids: createIdsCounter(config.ids),
  });
}
