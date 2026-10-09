// `acts-fixture` (TR-14): acts from test data, by change request; a change
// request it was given no acts for has none. It belongs only to the test
// assembly (plan/closure-check.md, the bypass class of acts: TR-14…TR-17).
import type { Act, Acts } from "../../ledger/ports/acts.js";

export type ActsFixtureOptions = { readonly acts: { readonly [request: string]: readonly Act[] } };

export function createActsFixture({ acts }: ActsFixtureOptions): Acts {
  return { read: (request) => Promise.resolve(Object.hasOwn(acts, request) ? (acts[request] ?? []) : []) };
}
