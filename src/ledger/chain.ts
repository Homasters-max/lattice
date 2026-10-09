// The chain of `knowledge` (LG-02, LG-04…LG-06): opening a store — the lines
// of a store to the verified and folded tail — is one operation. Each line is
// the canonical bytes of its commit and a line feed (KR-10, G-17), of the form
// of LG-06 (KR-04 for its records); the commits make a chain from genesis,
// signed by their land sessions (LG-05, LG-06); the ledger folds them from
// genesis (LG-35) and hands the rows to the store, which keeps them (LG-02).
// Every refusal is placed at the line of `store/knowledge.jsonl`, counted from
// 1 as `seq` is (Q-29). `openTail` and `verify-store` (S0-12) open a store
// through it; the next commit on a tail (S0-20) is the second operation here.
import { hashBytes, KR_10, refuse, reject, type Place, type Result } from "../kernel/index.js";
import { decodeCommit, verifyChain, type Commit, type KeyOfSession } from "./commit.js";
import { fold } from "./fold.js";
import { KNOWLEDGE, type Store } from "./ports/store.js";
import { viewOf, withDelta, type Row, type Rows, type View } from "./rows.js";

const LF = 0x0a;

/** The place of the line `n` of the store, from 1 (Q-29). */
const lineAt = (n: number): Place => ({ intent: null, path: `/${KNOWLEDGE}/${n}` });

/**
 * KR-10, G-17: the commit of a line — its canonical bytes and a line feed. A line without one is cut — the write of
 * the last line did not end — and is refused as it is, never repaired.
 */
function readLine(line: Uint8Array, place: Place): Result<Commit> {
  if (line.at(-1) !== LF) return refuse(reject(KR_10, { ...place, expected: "a line ending in a line feed", got: hashBytes(line) }));
  return decodeCommit(line.subarray(0, -1), place);
}

/** The lines of a store folded: its rows, the view at its tail over them, and the tail commit. */
export type Folded = { readonly rows: readonly Row[]; readonly view: View & Rows; readonly tail: Commit | null };

/**
 * LG-02, LG-05: the lines of a store from genesis — each as the store keeps it — verified and folded, or the
 * rejections of the first line that is no commit (KR-10, LG-06, KR-04), else of the chain (LG-04…LG-06). Signatures
 * are checked by `keyOfSession`; without it, none — only the stores landing opens, at the tail of `main` and on the
 * worktree of a change request, open so, until landing signs its commits (Q-39, S0-20). In S0 evidence is opaque: fold reads no run from it (S0-12).
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
  return { ok: true, value: { rows, view: viewOf(tail?.seq ?? 0, rows), tail } };
}

/** A store opened: the store, which keeps the rows the ledger folded, the view at its tail and the tail commit. */
export type Opened = { readonly store: Store; readonly view: View & Rows; readonly tail: Commit | null };

/** LG-02: opens a store — its lines from genesis, verified and folded as `openLines` does — and hands the rows to it. */
export async function openStore(store: Store, keyOfSession: KeyOfSession | null): Promise<Result<Opened>> {
  const lines: Uint8Array[] = [];
  for await (const line of store.commits(1)) lines.push(line);
  const folded = openLines(lines, keyOfSession);
  if (!folded.ok) return folded;
  await store.keep(folded.value.rows);
  return { ok: true, value: { store, view: folded.value.view, tail: folded.value.tail } };
}
