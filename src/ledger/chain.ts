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
import { isJsonObject, parseCanonicalLine, type Place, type Result } from "../kernel/index.js";
import { isPublicKey, type PublicKey } from "../trust/index.js";
import { readCommit, verifyChain, type Commit, type KeyOfSession } from "./commit.js";
import { fold } from "./fold.js";
import { KNOWLEDGE, type Store } from "./ports/store.js";
import { held, viewOf, withDelta, type Row, type Rows, type View } from "./rows.js";
import { SESSION_TYPE } from "./session-type.js";

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

/**
 * The keys a store opens by: the caller's `keyOfSession`; `STORE_KEYS` — the keys of the store itself, the key in the
 * certificate of each session event it holds (TR-11): landing writes the event of its land session into the commit it
 * lands (LG-22, S0-20); or `null` — no signature checked (Q-39).
 */
export const STORE_KEYS = "store-keys";

export type Keys = KeyOfSession | typeof STORE_KEYS | null;

const SESSION = `${SESSION_TYPE.id}@${String(SESSION_TYPE.rev)}`;

/**
 * TR-11: the session key of every record of the session type the commits hold, by its `id`; the first of an `id`
 * counts. That a session is an event (KR-05) and its body what its type admits (KR-21) apply checked when it landed.
 */
function storeKeys(commits: readonly Commit[]): KeyOfSession {
  const keys = new Map<string, PublicKey>();
  for (const r of commits.flatMap((c) => c.records)) {
    const certificate = r.type === SESSION && isJsonObject(r.body) ? r.body.certificate : undefined;
    const key = isJsonObject(certificate) ? certificate.key : undefined;
    if (typeof key === "string" && isPublicKey(key) && !keys.has(r.id)) keys.set(r.id, key);
  }
  return (session) => keys.get(session) ?? null;
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
 * are checked by `keys`; without them, none — only the stores landing opens, at the tail of `main` and on the
 * worktree of a change request, open so, until landing signs its commits (Q-39, S0-20). In S0 evidence is opaque: fold
 * is given none (S0-12).
 */
export function openLines(lines: readonly Uint8Array[], keys: Keys): Result<Folded> {
  const commits: Commit[] = [];
  for (const [index, line] of lines.entries()) {
    const commit = readLine(line, lineAt(index + 1));
    if (!commit.ok) return commit;
    commits.push(commit.value);
  }
  const chain = verifyChain(commits, keys === STORE_KEYS ? storeKeys(commits) : keys, { intent: null, path: `/${KNOWLEDGE}` });
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
export async function openStore(store: Store, keys: Keys): Promise<Result<Opened>> {
  const folded = openLines(await linesOf(store), keys);
  if (!folded.ok) return folded;
  await store.keep(folded.value.rows);
  const { view, tail, feed, viewAt } = folded.value;
  return { ok: true, value: { store, view, tail, feed, viewAt } };
}

/** What `verify-store` found: the commits of the chain and the rows that hold at its tail, rebuilt from genesis (RT-32). */
export type Verified = { readonly commits: number; readonly rows: number };

/**
 * RT-32, LG-05: a store verified — its lines, the chain and the signature of every commit by the key of its land session
 * as the store holds it, and its rows rebuilt from genesis — or the rejections of opening it. A rebuild here has nothing
 * to be compared with: `memory` and `jsonl` keep no rows between openings, so that it equals the rows accumulated commit
 * by commit (LG-37) is shown by the property test of fold; a store that keeps its rows is compared with them in S1.
 */
export async function verifyStore(store: Store): Promise<Result<Verified>> {
  const folded = openLines(await linesOf(store), STORE_KEYS);
  if (!folded.ok) return folded;
  return { ok: true, value: { commits: folded.value.tail?.seq ?? 0, rows: held(folded.value.rows).size } };
}
