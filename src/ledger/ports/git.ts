// The `git` port (LG-23): landing reaches git only through it. Adapters:
// `repo` and `fixture`. An operation with several arguments takes one object
// named by the arguments of LG-23 (CONVENTIONS.md §1). The exact types arrive
// with S0-20.

/** A change request merged onto a commit of `main`, not yet pushed: a directory the store opens on. */
export interface Worktree {
  readonly kind: "worktree";
  /** The commit it was prepared onto. */
  readonly onto: string;
  /** The head of the change request: the second parent of the landing commit (LG-22). */
  readonly head: string;
  /** The directory of the worktree; the `jsonl` store opens here (LG-23). */
  readonly dir: string;
  /** Paths of the files under a directory of the worktree, sorted. */
  list(dir: string): Promise<readonly string[]>;
  read(path: string): Promise<Uint8Array | null>;
  remove(path: string): Promise<void>;
}

/** The change request does not merge: its code conflicts at these paths (LG-24). */
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
  /** The commit `ref` points to. */
  tail(ref: string): Promise<string>;
  prepare(prepare: Prepare): Promise<Worktree | Conflict>;
  /** A compare-and-swap on `expected`. */
  push(push: Push): Promise<"pushed" | "moved">;
}
