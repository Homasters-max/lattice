// The `git` port (LG-23): landing reaches git only through it. Adapters:
// `repo` and `fixture`. An operation with several arguments takes one object
// named by the arguments of LG-23 (CONVENTIONS.md §1.9). Path order is part of
// the contract, as key order is of `store` (Q-18): one comparator, `sortPaths`,
// for the ledger and every adapter. Every worktree `prepare` returns is
// released: `push` releases the one it pushes, `release` it on any other
// outcome (D206). The exact types arrive with S0-20.
import { compareText } from "../../kernel/index.js";

/** Paths in the order of the port: by UTF-16 code units (CONVENTIONS.md §5.4). */
export const sortPaths = (paths: Iterable<string>): string[] => [...paths].sort(compareText);

/** A change request merged onto a commit of `main`, not yet pushed: a directory the store opens on, until it is released. */
export interface Worktree {
  readonly kind: "worktree";
  /** The commit it was prepared onto. */
  readonly onto: string;
  /** The head of the change request: the second parent of the landing commit (LG-22). */
  readonly head: string;
  /** The directory of the worktree; the `jsonl` store opens here (LG-23). */
  readonly dir: string;
  /**
   * Paths of the files under a directory of the worktree, in the order of `sortPaths`. The directory is a prefix
   * of the paths, given with its trailing slash — `store/proposals/` — and `""` is the whole tree.
   */
  list(dir: string): Promise<readonly string[]>;
  /** The bytes of the file at `path`; `null` where no file is — nothing, or a directory. */
  read(path: string): Promise<Uint8Array | null>;
  remove(path: string): Promise<void>;
  /** LG-23: frees the worktree on any outcome but a push, which frees it itself; after a push or a release it does nothing. */
  release(): Promise<void>;
}

/** The change request does not merge: its code conflicts at these paths, in the order of `sortPaths` (LG-24). */
export type Conflict = {
  readonly kind: "conflict";
  readonly paths: readonly string[];
};

export type Trailer = {
  readonly key: string;
  readonly value: string;
};

export type Prepare = {
  readonly request: string;
  readonly onto: string;
};

/** The worktree as one commit on `ref`, if `ref` is still `expected`. */
export type Push = {
  readonly worktree: Worktree;
  readonly ref: string;
  readonly expected: string;
  readonly message: string;
  readonly trailers: readonly Trailer[];
};

export interface Git {
  /** The commit `ref` points to; `null` when there is no such ref — a change request that does not exist (LG-54). */
  tail(ref: string): Promise<string | null>;
  /** `request` and `onto` exist: landing asks `tail` first. */
  prepare(prepare: Prepare): Promise<Worktree | Conflict>;
  /** A compare-and-swap on `expected`. */
  push(push: Push): Promise<"pushed" | "moved">;
}
