// `git-fixture` (LG-23): git for tests. Commits are whole trees kept in
// memory; a worktree is a temporary directory under `dir`, and `push` commits
// what that directory holds, as a compare-and-swap of the ref. `prepare`
// merges the change request onto `onto` against their merge base and ends
// `conflict` where both changed a path differently, or one put a file where the
// other put a directory (LG-24). A test adds a branch from where a ref is now
// with `branch`, as a developer does in git.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sortPaths, type Conflict, type Git, type Prepare, type Push, type Worktree } from "../../ledger/ports/git.js";

/** A branch: a commit on `from` (or a root) that writes these files; `null` removes one. */
export type GitFixtureBranch = { readonly from?: string; readonly files: { readonly [path: string]: string | null } };
export type GitFixtureOptions = { readonly dir: string; readonly branches: { readonly [name: string]: GitFixtureBranch } };
/** The git of tests: the port, and a branch added at any moment from where its `from` is then. */
export type GitFixture = Git & { branch(name: string, branch: GitFixtureBranch): void };

type Tree = ReadonlyMap<string, Uint8Array>;
type FixtureCommit = { readonly parents: readonly string[]; readonly tree: Tree; readonly message: string };

const same = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
  a === b || (a !== undefined && b !== undefined && Buffer.compare(a, b) === 0);

function overlay(base: Tree, files: GitFixtureBranch["files"]): Tree {
  const tree = new Map(base);
  for (const [path, text] of Object.entries(files)) {
    if (text === null) tree.delete(path);
    else tree.set(path, new TextEncoder().encode(text));
  }
  return tree;
}

/** The three-way merge of `top` onto `onto` from `base`: the merged tree, or the paths that conflict. */
function merge(base: Tree, onto: Tree, top: Tree): { readonly kind: "tree"; readonly tree: Tree } | Conflict {
  const tree = new Map(onto);
  const paths = new Set([...base.keys(), ...top.keys()]);
  // A path the request changed: taken when `onto` kept the base or made the same change.
  const changed = [...paths].filter((p) => !same(top.get(p), base.get(p)) && !same(onto.get(p), top.get(p)));
  for (const p of changed) {
    const bytes = top.get(p);
    if (bytes === undefined) tree.delete(p);
    else tree.set(p, bytes);
  }
  const files = [...tree.keys()];
  // A file where the other side put a directory: no tree holds both.
  const clashes = files.filter((p) => files.some((q) => q.startsWith(`${p}/`)));
  const conflicts = sortPaths(new Set([...changed.filter((p) => !same(onto.get(p), base.get(p))), ...clashes]));
  return conflicts.length > 0 ? { kind: "conflict", paths: conflicts } : { kind: "tree", tree };
}

async function filesOf(dir: string): Promise<Tree> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
  const rel = (p: string) => p.slice(dir.length + 1).replaceAll("\\", "/");
  return new Map(await Promise.all(paths.map(async (p) => [rel(p), await readFile(p)] as const)));
}

// What reading a path where no file is ends with: nothing there, a directory, or a file on the way.
const NO_FILE: readonly string[] = ["ENOENT", "EISDIR", "ENOTDIR"];

async function worktreeOf(dir: string, onto: string, head: string, tree: Tree): Promise<Worktree> {
  for (const [path, bytes] of tree) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
  return {
    kind: "worktree",
    onto,
    head,
    dir,
    list: async (under) => sortPaths([...(await filesOf(dir)).keys()].filter((p) => p.startsWith(under))),
    read: (path) => readFile(join(dir, path)).catch((e: NodeJS.ErrnoException) => (NO_FILE.includes(e.code ?? "") ? null : Promise.reject(e))),
    remove: (path) => rm(join(dir, path), { force: true }),
  };
}

export function createGitFixture({ dir, branches }: GitFixtureOptions): GitFixture {
  const commits = new Map<string, FixtureCommit>();
  const refs = new Map<string, string>();
  const add = (c: FixtureCommit) => {
    const id = `fixture-${commits.size + 1}`;
    commits.set(id, c);
    return id;
  };
  const find = (ref: string): string | null => {
    const id = refs.get(ref) ?? ref;
    return commits.has(id) ? id : null;
  };
  // `prepare` takes refs `tail` found (the port's contract), and a branch starts from one defined before it.
  const commitOf = (ref: string): string => {
    const id = find(ref);
    if (id === null) throw new Error(`bug: git-fixture has no ${ref}: prepare takes refs tail found, a branch starts from one defined before it`);
    return id;
  };
  const treeOf = (id: string): Tree => commits.get(id)?.tree ?? new Map();
  const ancestors = (id: string): string[] => [id, ...(commits.get(id)?.parents ?? []).flatMap(ancestors)];
  const branch = (name: string, { from, files }: GitFixtureBranch) => {
    const parent = from === undefined ? null : commitOf(from);
    refs.set(name, add({ parents: parent === null ? [] : [parent], tree: overlay(parent === null ? new Map() : treeOf(parent), files), message: name }));
  };
  for (const [name, b] of Object.entries(branches)) branch(name, b);
  return {
    branch,
    tail: (ref) => Promise.resolve(find(ref)),
    async prepare({ request, onto }: Prepare) {
      const [head, base] = [commitOf(request), commitOf(onto)];
      const shared = new Set(ancestors(base));
      const mergeBase = ancestors(head).find((id) => shared.has(id));
      const merged = merge(mergeBase === undefined ? new Map() : treeOf(mergeBase), treeOf(base), treeOf(head));
      if (merged.kind === "conflict") return merged;
      await mkdir(dir, { recursive: true });
      return worktreeOf(await mkdtemp(join(dir, "worktree-")), base, head, merged.tree);
    },
    async push({ worktree, ref, expected, message, trailers }: Push) {
      if (refs.get(ref) !== expected) return "moved";
      const text = [message, "", ...trailers.map((t) => `${t.key}: ${t.value}`)].join("\n");
      refs.set(ref, add({ parents: [expected, worktree.head], tree: await filesOf(worktree.dir), message: text }));
      await rm(worktree.dir, { recursive: true, force: true });
      return "pushed";
    },
  };
}
