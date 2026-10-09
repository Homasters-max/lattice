// `acts-init` (TR-14, LG-47): the acts of store init. The three commits of
// init reach git through landing with acts of this adapter: the owner the init
// configuration names approves the proposal of each by its hash (TR-15). The
// init configuration is where these acts live and what checked them: the
// owner runs init with it (G-55).
import type { Act, Acts } from "../../ledger/ports/acts.js";

export type ActsInitOptions = {
  /** The identity of the owner the init configuration names (TR-01, TR-09). */
  readonly identity: string;
  /** The init configuration, an absolute URI: where the acts of init live (TR-16). */
  readonly uri: string;
  /** The time of init, the source time of its acts (KR-11). */
  readonly at: string;
  /** The hash of the proposal each change request of init carries: what its act approves (TR-15). */
  readonly proposals: { readonly [request: string]: string };
};

export function createActsInit({ identity, uri, at, proposals }: ActsInitOptions): Acts {
  const target = (request: string) => (Object.hasOwn(proposals, request) ? proposals[request] : undefined);
  return {
    read: (request) => {
      const hash = target(request);
      const acts: readonly Act[] = hash === undefined ? [] : [{ verb: "approve", target: hash, identity, uri, at, verified: true }];
      return Promise.resolve(acts);
    },
  };
}
