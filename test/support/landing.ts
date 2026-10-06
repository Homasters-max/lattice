// The ports of landing for its tests (test/ledger): the adapters that exist for
// tests — `git-fixture`, `acts-fixture`, `clock-fixed`, `ids-counter` (ST-07,
// TR-14) — and `store-jsonl` on every worktree (LG-23), frozen; and the
// proposal file a change request brings to create one entity.
import { createActsFixture } from "../../src/adapters/acts-fixture/index.js";
import { createClockFixed } from "../../src/adapters/clock-fixed/index.js";
import { createGitFixture, type GitFixtureOptions } from "../../src/adapters/git-fixture/index.js";
import { createIdsCounter } from "../../src/adapters/ids-counter/index.js";
import { createStoreJsonl } from "../../src/adapters/store-jsonl/index.js";
import type { LandingPorts, Worktree } from "../../src/ledger/index.js";
import { deepFreeze } from "./deep-freeze.js";

/** The time of `clock-fixed`, and the `at` of every intent of `proposal`. */
export const AT = "2026-10-06T12:00:00.000000Z";

/** The proposal file of a change request that creates the entity `id`. */
export const proposal = (id: string): string =>
  JSON.stringify({
    session: { id: "01JB2X00000000000000000SES" },
    intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: AT, body: { text: id } }],
    sig: null,
  });

/** The ports of landing on a git fixture; `over` replaces some of them. */
export function landingPorts(git: GitFixtureOptions, over: Partial<LandingPorts> = {}): LandingPorts {
  return deepFreeze({
    git: createGitFixture(git),
    acts: createActsFixture({ acts: {} }),
    openStore: (w: Worktree) => createStoreJsonl({ dir: w.dir }),
    clock: createClockFixed({ at: AT }),
    ids: createIdsCounter(),
    ...over,
  });
}
