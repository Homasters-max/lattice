// What the tests of landing (test/ledger) give and expect: the proposal file a
// change request brings to create one entity, and the text of a store of given
// commits. The ports of landing come from the test assembly (assembly.ts).
import { fileOf } from "../../src/adapters/store-jsonl/index.js";
import { encodeCommit, type Commit } from "../../src/ledger/index.js";
import { AT } from "./assembly.js";

/** The proposal file of a change request that creates the entity `id`; every intent is `at` the time of the clock of the tests. */
export const proposal = (id: string): string =>
  JSON.stringify({
    session: { id: "01JB2X00000000000000000SES" },
    intents: [{ op: "entity", id, type: "demo/note@1", expected: null, at: AT, body: { text: id } }],
    sig: null,
  });

/** The bytes of `store/knowledge.jsonl` as text; `""` where there is no file, the empty store. */
export const text = (bytes: Uint8Array | null): string => (bytes === null ? "" : new TextDecoder().decode(bytes));

/** The text of a store of exactly these commits, in order: the lines landing writes, framed by `fileOf` of `store-jsonl`. */
export const storeTextOf = (commits: readonly Commit[]): string => commits.map((c) => text(fileOf(encodeCommit(c)))).join("");
