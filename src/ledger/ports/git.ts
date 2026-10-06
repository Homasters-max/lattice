// The `git` port (LG-23): landing reaches git only through it. Adapters:
// `repo` and `fixture`. The exact types arrive with S0-20.

/** A change request merged onto a commit of `main`, not yet pushed. */
export interface Worktree {
  readonly kind: "worktree";
  /** The commit it was prepared onto. */
  readonly onto: string;
  /** The head of the change request: the second parent of the landing commit (LG-22). */
  readonly head: string;
  /** Paths of the files under a directory, sorted. */
  list(dir: string): Promise<readonly string[]>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}

/** The change request does not merge: its code conflicts at these paths (LG-24). */
export interface Conflict {
  readonly kind: "conflict";
  readonly paths: readonly string[];
}

export interface Trailer {
  readonly key: string;
  readonly value: string;
}

/** What `push` writes: the worktree as one commit on `ref`, if `ref` is still `expected`. */
export interface Push {
  readonly worktree: Worktree;
  readonly ref: string;
  readonly expected: string;
  readonly message: string;
  readonly trailers: readonly Trailer[];
}

export interface Git {
  /** The commit `ref` points to. */
  tail(ref: string): Promise<string>;
  prepare(request: string, onto: string): Promise<Worktree | Conflict>;
  /** A compare-and-swap on `expected`. */
  push(push: Push): Promise<"pushed" | "moved">;
}
