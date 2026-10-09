// The store at the tail of `main` (LG-02, LG-14, LG-23, LG-38): a worktree of
// the tail commit alone, what it holds at `store/knowledge.jsonl`, and the
// `jsonl` store opened there (chain.ts): its lines verified and folded from
// genesis, the rows handed to it. Landing takes `before` from it, assembly the
// read view. The worktree is released once the lines are read, on any outcome
// (LG-23, D206): the store keeps the rows it was handed, the view the rows it
// folded. Its signatures are checked from S0-20, when landing signs (Q-39).
import { hashBytes, refuse, reject, type Result } from "../kernel/index.js";
import { openStore, type Opened } from "./chain.js";
import type { Git, Worktree } from "./ports/git.js";
import { KNOWLEDGE, type Store } from "./ports/store.js";
import { LG_23 } from "./rules.js";

/** The ports the store at the tail opens through. */
export interface TailPorts {
  readonly git: Git;
  /** Opens the `jsonl` store on a worktree (LG-23). */
  readonly openStore: (worktree: Worktree) => Store;
}

export const MAIN = "main";

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

/**
 * The store at the tail of `main`: the commit `onto`, the store opened there, the read view at it and its commit, and
 * the bytes of `store/knowledge.jsonl` there — `null` where main has none, the empty store. The worktree of the store
 * is released: it answers `row` and `rows` from the rows it was handed.
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
    // Q-39: landing writes commits with `sig: null` until S0-20, which signs them and checks their signatures here.
    const opened = await openStore(ports.openStore(worktree), null);
    return opened.ok ? { ok: true, value: { ...opened.value, onto, file: file.value } } : opened;
  } finally {
    await worktree.release();
  }
}
