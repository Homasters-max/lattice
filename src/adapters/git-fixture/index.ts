// `git-fixture` (LG-23): git in memory for tests. Branches are commits of
// whole trees; `prepare` lays the change request over `onto`, and `push` is a
// compare-and-swap of the ref. Conflicts and the merge of S0-20 come with it.
import type { Conflict, Git, Push, Worktree } from "../../ledger/ports/git.js";

/** The files of a branch, as UTF-8 text. */
export type GitFixtureFiles = { readonly [path: string]: string };
export type GitFixtureOptions = { readonly branches: { readonly [name: string]: GitFixtureFiles } };

type Tree = ReadonlyMap<string, Uint8Array>;

interface FixtureCommit {
  readonly parents: readonly string[];
  readonly tree: Tree;
  readonly message: string;
}

const encode = (text: string) => new TextEncoder().encode(text);

function worktreeOf(onto: string, head: string, files: Map<string, Uint8Array>): Worktree {
  return {
    kind: "worktree",
    onto,
    head,
    list: (dir) => Promise.resolve([...files.keys()].filter((p) => p.startsWith(dir)).sort()),
    read: (path) => Promise.resolve(files.get(path) ?? null),
    write: (path, bytes) => Promise.resolve(void files.set(path, bytes)),
    remove: (path) => Promise.resolve(void files.delete(path)),
  };
}

export function createGitFixture({ branches }: GitFixtureOptions): Git {
  const commits = new Map<string, FixtureCommit>();
  const refs = new Map<string, string>();
  const trees = new Map<Worktree, Map<string, Uint8Array>>();
  const commit = (c: FixtureCommit) => {
    const id = `fixture-${commits.size + 1}`;
    commits.set(id, c);
    return id;
  };
  for (const [name, files] of Object.entries(branches)) {
    refs.set(name, commit({ parents: [], tree: new Map(Object.entries(files).map(([p, t]) => [p, encode(t)])), message: name }));
  }
  const treeOf = (ref: string): Tree | undefined => commits.get(refs.get(ref) ?? ref)?.tree;
  return {
    tail: (ref) => Promise.resolve(refs.get(ref) ?? ""),
    prepare(request, onto): Promise<Worktree | Conflict> {
      const [base, top] = [treeOf(onto), treeOf(request)];
      if (base === undefined || top === undefined) return Promise.reject(new Error(`git-fixture: no commit ${onto} or ${request}`));
      const files = new Map([...base, ...top]);
      const worktree = worktreeOf(onto, refs.get(request) ?? request, files);
      trees.set(worktree, files);
      return Promise.resolve(worktree);
    },
    push({ worktree, ref, expected, message, trailers }: Push) {
      if (refs.get(ref) !== expected) return Promise.resolve("moved" as const);
      const text = [message, "", ...trailers.map((t) => `${t.key}: ${t.value}`)].join("\n");
      refs.set(ref, commit({ parents: [expected, worktree.head], tree: new Map(trees.get(worktree)), message: text }));
      return Promise.resolve("pushed" as const);
    },
  };
}
