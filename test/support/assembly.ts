// The test assembly (plan/closure-check.md, the bypass class of acts): the adapters that
// exist for tests — `git-fixture`, `acts-fixture`, `clock-fixed`, `ids-counter`
// (ST-07, TR-14) — reach the working code only from here: the whole assembly
// for the commands, the ports of landing for the tests of the ledger, or the git
// of the tests. No file of `src/` imports them (test/structure, ST-07); the
// contract tests of a port import the adapters they test (CONVENTIONS.md §9).
import { createActsFixture, type ActsFixtureOptions } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed, type ClockFixedOptions } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter, type IdsCounterOptions } from "../../src/adapters/ids-counter/index.js";
import { assemble, landingPortsOf, type Assembly } from "../../src/assembly/index.js";
import type { LandingPorts } from "../../src/ledger/index.js";
import { deepFreeze } from "./deep-freeze.js";

export type { GitFixtureBranch, GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";

export type FixtureConfig = {
  readonly git: GitFixtureOptions;
  readonly acts: ActsFixtureOptions;
  readonly clock: ClockFixedOptions;
  readonly ids?: IdsCounterOptions;
};

/** The time of `clock-fixed` in the ports of landing for tests. */
export const AT = "2026-10-06T12:00:00.000000Z";

/** The git of the tests: the port of `git-fixture` and `branch`, which adds a branch at any moment. */
export const gitForTests = (options: GitFixtureOptions) => createGitFixture(options);

/** The adapters for tests as the ports `assemble` takes. */
const fixturePorts = (config: FixtureConfig) => ({
  git: gitForTests(config.git),
  acts: createActsFixture(config.acts),
  clock: createClockFixed(config.clock),
  ids: createIdsCounter(config.ids),
});

export function assembleForTests(config: FixtureConfig): Assembly {
  return assemble(fixturePorts(config));
}

/**
 * The ports of landing for the tests of the ledger, wired as `assemble` wires them (`landingPortsOf`), frozen:
 * the git fixture of `repository`, no acts, the clock at `AT`; `over` replaces some of them.
 */
export function landingPortsForTests(repository: GitFixtureOptions, over: Partial<LandingPorts> = {}): LandingPorts {
  return deepFreeze({ ...landingPortsOf(fixturePorts({ git: repository, acts: { acts: {} }, clock: { at: AT } })), ...over });
}
