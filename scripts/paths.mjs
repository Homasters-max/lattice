// paths: the classifier of the paths of this repository (S0-42) — one home for what a path is to the tools of the
// loop: its class, the test set that owns it, the test sets of fitness and the project `tools`, how vitest is given a
// test set and the seed of its run. scripts/prove.mjs, scripts/mutate.mjs, plan/tools/dev-loop/scope.mjs and the brief of plan/tools/dev-loop/context.mjs take the
// classes from here; test/support/files.ts takes from here what a test set owns (ST-18).

/** The class of a path: what a round of review reads in it and what the brief of an agent carries for it. */
export function classOf(path) {
  if (path.startsWith("docs/design/")) return "design";
  if (/^(src|scripts|plan\/tools|discussion\/tools)\//.test(path)) return "code";
  if (/^(gen|store)\//.test(path)) return "generated";
  if (path.startsWith("test/")) return "tests";
  if (/^(package(-lock)?\.json|tsconfig[^/]*\.json|eslint\.config\.js|vitest\.config\.ts|\.gitattributes)$|^\.github\//.test(path)) return "config";
  if (path === "CONVENTIONS.md") return "conventions";
  if (/^plan\/phases\/[^/]+\/(tasks\/|PLAN\.md$)/.test(path)) return "task";
  return "text";
}

/** The rows of ST (docs/design/13-structure.md) a file of a class touches: the brief of Standards carries their text (S0-48). */
export const ST_BY_CLASS = {
  code: ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-11", "ST-17"],
  tests: ["ST-07", "ST-13", "ST-17", "ST-18"],
  config: ["ST-09", "ST-12"],
  generated: ["ST-08"],
};

/** The test sets of fitness: they run on every change request (ST-12), whatever it changes. */
export const FITNESS = ["structure", "fixtures", "e2e", "smoke"];

/** A file of the development tools: `plan/tools/**`, `scripts/**`, `discussion/tools/**`. */
export const isTool = (path) => /^(plan\/tools|scripts|discussion\/tools)\//.test(path);

/** The test set of a file under `test/`: `test/<set>/…` → `<set>`; a file at the root of `test/` → `smoke`; else null. */
export function testSetOf(path) {
  const folder = /^test\/([^/]+)\/./.exec(path);
  if (folder) return folder[1];
  return /^test\/[^/]+$/.test(path) ? "smoke" : null;
}

// What a test set reads at run time beyond its folder test/<set>/ (ST-18; G-30): the files of the repository it checks
// as data. A fitness test set checks the whole repository on every change request, so it owns every file.
const OWNS = {
  // bin.test.ts builds src/ into the bin with tsconfig.build.json and reads the bin of package.json; session.test.ts
  // issues sessions with the dev keys (Q-04).
  cli: ["src/", "package.json", "tsconfig.json", "tsconfig.build.json", "test/keys/"],
  // form.test.ts and imports.test.ts audit the files of src/ through repoTree of test/structure/tree.ts; import.test.ts
  // checks the bodies it imports against the types of std/ (S0-26).
  codec: ["src/", "package.json", "package-lock.json", "std/"],
  // vectors.test.ts reads the frozen vectors (KR-13).
  kernel: ["test/vectors/"],
  // std-types.test.ts checks the sources of std/ — the types of std as data (S0-08, S0-09).
  ledger: ["std/"],
  // budget.test.ts reads every test file for the budget of its properties.
  support: ["test/"],
  // signature.test.ts reads the dev keys as OpenSSH files (Q-04); policy.test.ts and session.test.ts read a policy
  // and a session against their types — std/namespace-policy of std/source and core/session (KR-21).
  trust: ["test/keys/", "std/"],
  // the tests of the tools run them on copies of the plan and check the documents of the loop against them, and
  // that every file those documents name exists.
  tools: ["plan/", "scripts/", "discussion/tools/", ".claude/", "AGENTS.md", "CONVENTIONS.md", "test/structure/skeleton-files.txt", "test/support/assembly.ts"],
};

/** The filters vitest takes for a test set: its folder, or the test files at the root of test/ for smoke. */
export const filtersOf = (set, files) => (set === "smoke" ? files.filter((p) => /^test\/[^/]+\.test\.ts$/.test(p)) : [`test/${set}/`]);

/** The seed of fast-check for a test set from the hash of its input: its first 32 bits as a signed integer (RT-21; LATTICE_SEED, S0-41). */
export const seedOf = (hash) => Number.parseInt(hash.slice("sha256:".length, "sha256:".length + 8), 16) | 0;

/** The roots a test set owns: a folder ends with `/`, a file is itself, `""` is the whole repository. */
function ownedRoots(set) {
  if (FITNESS.includes(set)) return [""];
  return [`test/${set}/`, ...(OWNS[set] ?? [])];
}

/** Whether test set `set` owns the file `path` (relative to the root, with `/`). */
export function owns(set, path) {
  return ownedRoots(set).some((root) => root === "" || (root.endsWith("/") ? path.startsWith(root) : path === root));
}
