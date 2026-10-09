// The chain of `knowledge` (LG-02, LG-04…LG-06): opening a store — the lines
// of a store to the verified and folded tail — is one operation. Each line is
// the canonical bytes of its commit and a line feed (KR-10, G-17), of the form
// of LG-06 (KR-04 for its records); the commits make a chain from genesis,
// signed by their land sessions (LG-05, LG-06); the ledger folds them from
// genesis (LG-35) and hands the rows to the store, which keeps them (LG-02).
// Every refusal is placed at the line of `store/knowledge.jsonl`, counted from
// 1 as `seq` is (Q-29). `openTail` and `verifyStore` open a store through it;
// the next commit on a tail (S0-20) is the second operation here. An opened
// store gives the feed of its commits by `seq` and a view at any `seq` (LG-41).
import { parseCanonicalLine, type Place, type Result } from "../kernel/index.js";
import { readCommit, verifyChain, type Commit, type KeyOfSession } from "./commit.js";
import { fold } from "./fold.js";
import { KNOWLEDGE, type Store } from "./ports/store.js";
import { held, viewOf, withDelta, type Row, type Rows, type View } from "./rows.js";

/** The place of the line `n` of the store, from 1 (Q-29). */
const lineAt = (n: number): Place => ({ intent: null, path: `/${KNOWLEDGE}/${n}` });

/**
 * The commit of a line: the kernel reads the line — its canonical bytes and a line feed — and refuses KR-10 a line
 * cut, bytes that are not UTF-8, a text that is not JSON (an empty line too) and bytes that are not the canonical
 * bytes of their value (`parseCanonicalLine`, G-17); LG-06 and KR-04 refuse its form.
 */
function readLine(line: Uint8Array, place: Place): Result<Commit> {
  const parsed = parseCanonicalLine(line, place);
  return parsed.ok ? readCommit(parsed.value.value, place) : parsed;
}

/** LG-41: the commits of a store from `seq` on, in order — its feed; `null` for a `from` that is no `seq`, not an integer. */
export type Feed = (from: number) => readonly Commit[] | null;

/** The lines of a store folded: its rows, the view at its tail over them, the tail commit, its feed and a view at any `seq` (LG-41). */
export type Folded = {
  readonly rows: readonly Row[];
  readonly view: View & Rows;
  readonly tail: Commit | null;
  readonly feed: Feed;
  /** `view(seq)` for a `seq` from 0 to the tail, or `null`. */
  readonly viewAt: (seq: number) => (View & Rows) | null;
};

/**
 * LG-02, LG-05: the lines of a store from genesis — each as the store keeps it — verified and folded, or the
 * rejections of the first line that is no commit (KR-10, LG-06, KR-04), else of the chain (LG-04…LG-06). Signatures
 * are checked by `keyOfSession`; without it, none — the stores landing opens, at the tail of `main` and on the
 * worktree of a change request, and `verify-store` open so until landing signs its commits (Q-39, G-51, S0-20). In S0 evidence is opaque: fold
 * is given none (S0-12).
 */
export function openLines(lines: readonly Uint8Array[], keyOfSession: KeyOfSession | null): Result<Folded> {
  const commits: Commit[] = [];
  for (const [index, line] of lines.entries()) {
    const commit = readLine(line, lineAt(index + 1));
    if (!commit.ok) return commit;
    commits.push(commit.value);
  }
  const chain = verifyChain(commits, keyOfSession, { intent: null, path: `/${KNOWLEDGE}` });
  if (!chain.ok) return chain;
  let rows: readonly Row[] = [];
  for (const c of chain.value) rows = withDelta(rows, fold(viewOf(c.seq - 1, rows), c, []));
  const tail = chain.value.at(-1) ?? null;
  const last = tail?.seq ?? 0;
  const feed: Feed = (from) => (Number.isSafeInteger(from) ? chain.value.slice(Math.max(from, 1) - 1) : null);
  const viewAt = (seq: number) => (Number.isSafeInteger(seq) && seq >= 0 && seq <= last ? viewOf(seq, rows) : null);
  return { ok: true, value: { rows, view: viewOf(last, rows), tail, feed, viewAt } };
}

/** A store opened: the store, which keeps the rows the ledger folded, the view at its tail, the tail commit, the feed and a view at any `seq`. */
export type Opened = Omit<Folded, "rows"> & { readonly store: Store };

async function linesOf(store: Store): Promise<Uint8Array[]> {
  const lines: Uint8Array[] = [];
  for await (const line of store.commits(1)) lines.push(line);
  return lines;
}

/** LG-02: opens a store — its lines from genesis, verified and folded as `openLines` does — and hands the rows to it. */
export async function openStore(store: Store, keyOfSession: KeyOfSession | null): Promise<Result<Opened>> {
  const folded = openLines(await linesOf(store), keyOfSession);
  if (!folded.ok) return folded;
  await store.keep(folded.value.rows);
  const { view, tail, feed, viewAt } = folded.value;
  return { ok: true, value: { store, view, tail, feed, viewAt } };
}

/** What `verify-store` found: the commits of the chain and the rows that hold at its tail, rebuilt from genesis (RT-32). */
export type Verified = { readonly commits: number; readonly rows: number };

/**
 * RT-32, LG-05: a store verified — its lines and the chain, and its rows rebuilt from genesis — or the rejections of
 * opening it. No signature is checked until landing signs its commits; where the key of a land session comes from is
 * decided with it (Q-39, G-51, S0-20). A rebuild here has nothing
 * to be compared with: `memory` and `jsonl` keep no rows between openings, so that it equals the rows accumulated commit
 * by commit (LG-37) is shown by the property test of fold; a store that keeps its rows is compared with them in S1.
 */
export async function verifyStore(store: Store): Promise<Result<Verified>> {
  const folded = openLines(await linesOf(store), null);
  if (!folded.ok) return folded;
  return { ok: true, value: { commits: folded.value.tail?.seq ?? 0, rows: held(folded.value.rows).size } };
}
