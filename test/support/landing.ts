// What the tests of landing (test/ledger) give and expect: the proposal file a
// change request brings to create one entity, the text of a store of given
// commits, a worktree of main, main moved by someone else, and the refusals of
// an outcome. The ports of landing come from the test assembly (assembly.ts).
import { commitLine, type Commit, type Git, type LandingOutcome } from "../../src/ledger/index.js";
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

/** The text of a store of exactly these commits, in order: the lines landing writes (`commitLine`). */
export const storeTextOf = (commits: readonly Commit[]): string => commits.map((c) => text(commitLine(c))).join("");

/** The tail of main and a worktree of `request` prepared onto it; without `request`, of the tail commit alone. The caller releases it, or pushes it. */
export async function onMain(git: Git, request?: string) {
  const onto = await git.tail("main");
  const worktree = onto === null ? null : await git.prepare({ request: request ?? onto, onto });
  if (onto === null || worktree?.kind !== "worktree") throw new Error(`bug: ${request ?? "main"} of the fixture prepares onto main`);
  return { onto, worktree };
}

/** Someone else moves main: the code of `request` pushed onto its tail, with its own message and no trailers of landing. */
export async function moveMain(git: Git, request: string): Promise<void> {
  const { onto, worktree } = await onMain(git, request);
  await git.push({ worktree, ref: "main", expected: onto, message: "m", trailers: [] });
}

/** The rule and path of each refusal of an outcome, or the outcome that refused nothing. */
export const refusals = (out: LandingOutcome) => (out.outcome === "rejections" ? out.rejections.map((r) => [r.rule, r.path]) : out.outcome);
