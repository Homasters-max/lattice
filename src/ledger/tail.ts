// The store at the tail of `main` (LG-02, LG-14, LG-23, LG-38): a worktree of
// the tail commit alone, what it holds at `store/knowledge.jsonl`, the lines
// of the `jsonl` store opened there, folded from genesis into the read view.
// Landing takes `before` from it, assembly the read view. The worktree is
// released once the lines are read, on any outcome (LG-23, D206): the view
// keeps the rows it folded. Verifying the chain, handing the rows to the
// adapter (Q-25) and refusing a cut last line arrive with S0-11.
import { hashBytes, refuse, reject, type Result } from "../kernel/index.js";
import { decodeCommit, type Commit } from "./commit.js";
import { fold } from "./fold.js";
import type { Git, Worktree } from "./ports/git.js";
import type { Store } from "./ports/store.js";
import { withDelta, type Row, type Rows } from "./rows.js";
import { viewOf, type View } from "./rows-view.js";
import { LG_23 } from "./rules.js";

/** The ports the store at the tail opens through. */
export interface TailPorts {
  readonly git: Git;
  /** Opens the `jsonl` store on a worktree (LG-23). */
  readonly openStore: (worktree: Worktree) => Store;
}

export const MAIN = "main";
/** LG-50: the path of the store of `knowledge` in a tree. */
export const KNOWLEDGE = "store/knowledge.jsonl";

/** What a worktree holds at a path: the bytes of a file, the files of a directory, or nothing. */
export type AtPath = Uint8Array | { readonly files: readonly string[] } | null;

export async function atPath(worktree: Worktree, path: string): Promise<AtPath> {
  const bytes = await worktree.read(path);
  if (bytes !== null) return bytes;
  const files = await worktree.list(`${path}/`);
  return files.length > 0 ? { files } : null;
}

/** Bytes are no JSON value: a refusal names a file by its hash (Q-19), a directory by its files. */
export const nameOf = (at: AtPath) => (at === null ? null : at instanceof Uint8Array ? hashBytes(at) : [...at.files]);

/** LG-23: only the `jsonl` adapter writes `store/knowledge.jsonl`, so main holds it as a file or not at all. */
function fileOnMain(tail: AtPath): Result<Uint8Array | null> {
  if (tail === null || tail instanceof Uint8Array) return { ok: true, value: tail };
  return refuse(reject(LG_23, { intent: null, path: `/${KNOWLEDGE}`, expected: "a file or none", got: nameOf(tail) }));
}

/** A store opened: the view at its tail and the tail commit. */
type Opened = { readonly view: View & Rows; readonly tail: Commit | null };

/**
 * LG-02: opening a store folds its commits from genesis; a line that is not a commit is refused (KR-10, LG-06,
 * KR-04) at the line of `store/knowledge.jsonl`, counted from 1 as `seq` is (Q-29). The walking skeleton keeps
 * the rows in the view (Q-25).
 */
export function openLines(lines: readonly Uint8Array[]): Result<Opened> {
  let rows: Row[] = [];
  let opened: Opened = { view: viewOf(0, []), tail: null };
  for (const [index, line] of lines.entries()) {
    const commit = decodeCommit(line, `/${KNOWLEDGE}/${index + 1}`);
    if (!commit.ok) return commit;
    rows = withDelta(rows, fold(opened.view, commit.value, []));
    opened = { view: viewOf(commit.value.seq, rows), tail: commit.value };
  }
  return { ok: true, value: opened };
}

/** The bytes of the lines of a store from genesis, as the store keeps them. */
async function linesOf(store: Store): Promise<Uint8Array[]> {
  const lines: Uint8Array[] = [];
  for await (const line of store.commits(1)) lines.push(line);
  return lines;
}

/**
 * The store at the tail of `main`: the commit `onto`, the read view at it and its commit, and the bytes of
 * `store/knowledge.jsonl` there — `null` where main has none, the empty store.
 */
export type OpenedTail = Opened & { readonly onto: string; readonly file: Uint8Array | null };

/** Opens the store at the tail of `main` (GL-05) on a worktree of that commit alone. */
export async function openTail(ports: TailPorts): Promise<Result<OpenedTail>> {
  const onto = await ports.git.tail(MAIN);
  // A store lives on main from its init (LG-47, S0-23).
  if (onto === null) throw new Error(`bug: the repository of the store has no ${MAIN}`);
  const worktree = await ports.git.prepare({ request: onto, onto });
  if (worktree.kind === "conflict") throw new Error("bug: a commit conflicts with itself");
  try {
    const file = fileOnMain(await atPath(worktree, KNOWLEDGE));
    if (!file.ok) return file;
    // The store opens only on a file; main without one holds the empty store.
    const opened = openLines(file.value === null ? [] : await linesOf(ports.openStore(worktree)));
    return opened.ok ? { ok: true, value: { ...opened.value, onto, file: file.value } } : opened;
  } finally {
    await worktree.release();
  }
}
