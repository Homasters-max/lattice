// paths: the classifier of the paths of this repository (S0-42) — one home for what a path is to the tools of the
// loop: its class, the test set that owns it, the test sets of fitness and the project `tools`.
// scripts/prove.mjs, plan/tools/dev-loop/scope.mjs and the brief of plan/tools/dev-loop/context.mjs take the
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

/** The project of the tests of the development tools (vitest.config.ts): it runs when a tool changes. */
export const TOOLS = "tools";

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
  // bin.test.ts builds src/ into the bin with tsconfig.build.json and reads the bin of package.json.
  cli: ["src/", "package.json", "tsconfig.json", "tsconfig.build.json"],
  // form.test.ts and imports.test.ts audit the files of src/ through repoTree of test/structure/tree.ts.
  codec: ["src/", "package.json", "package-lock.json"],
  // vectors.test.ts reads the frozen vectors (KR-13).
  kernel: ["test/vectors/"],
  // budget.test.ts reads every test file for the budget of its properties.
  support: ["test/"],
  // the tests of the tools run them on copies of the plan and check the documents of the loop against them, and
  // that every file those documents name exists.
  tools: ["plan/", "scripts/", "discussion/tools/", ".claude/", "AGENTS.md", "CONVENTIONS.md", "test/structure/skeleton-files.txt", "test/support/assembly.ts"],
};

/** The roots a test set owns: a folder ends with `/`, a file is itself, `""` is the whole repository. */
export function ownedRoots(set) {
  if (FITNESS.includes(set)) return [""];
  return [`test/${set}/`, ...(OWNS[set] ?? [])];
}

/** Whether test set `set` owns the file `path` (relative to the root, with `/`). */
export function owns(set, path) {
  return ownedRoots(set).some((root) => root === "" || (root.endsWith("/") ? path.startsWith(root) : path === root));
}
