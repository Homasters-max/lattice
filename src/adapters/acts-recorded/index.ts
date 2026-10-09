// `acts-recorded` (TR-16): the acts landing already read and wrote into a
// commit as `act` events. Re-landing, opening a store and fold read acts
// through it and never call a forge or git: each act is the one its source
// gave, with the result of the check made then. The caller gives the commit
// that landed each change request (G-55).
import { actsOf, type Acts, type Commit } from "../../ledger/ports/acts.js";

export type ActsRecordedOptions = { readonly commits: { readonly [request: string]: Commit } };

export function createActsRecorded({ commits }: ActsRecordedOptions): Acts {
  const landed = (request: string) => (Object.hasOwn(commits, request) ? commits[request] : undefined);
  return {
    read: (request) => {
      const commit = landed(request);
      return Promise.resolve(commit === undefined ? [] : actsOf(commit));
    },
  };
}
