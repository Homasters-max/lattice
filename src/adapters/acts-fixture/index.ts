// `acts-fixture` (TR-14): acts from test data, by change request. It belongs
// only to the test assembly (plan/closure-check.md, «acts и права»).
import type { Acts, ActSource } from "../../ledger/ports/acts.js";

export type ActsFixtureOptions = { readonly acts: { readonly [request: string]: readonly ActSource[] } };

export function createActsFixture({ acts }: ActsFixtureOptions): Acts {
  return { read: (request) => Promise.resolve(acts[request] ?? []) };
}
