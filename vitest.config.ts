import { readdirSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, type ViteUserConfig } from "vitest/config";
import { SAFEGUARD_MS } from "./test/support/budget.js";

// Two projects (S0-40): `tools` — the tests of the development tools in plan/tools/ and discussion/tools/,
// `lattice` — the rest. `npm test` runs both, so every fitness test runs on every change request (ST-12).
export type Project = { readonly name: string; readonly include: readonly string[]; readonly exclude: readonly string[] };

const projects: readonly Project[] = [
  { name: "lattice", include: ["test/**/*.test.ts"], exclude: [...configDefaults.exclude, "test/tools/**"] },
  { name: "tools", include: ["test/tools/**/*.test.ts"], exclude: [] },
];

/** The test files under test/ of the repository at `root`: paths from the root with `/`, sorted. */
export const testFiles = (root: string): readonly string[] =>
  readdirSync(join(root, "test"), { recursive: true, encoding: "utf8" })
    .map((f) => `test/${f.replaceAll("\\", "/")}`)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();

/** The names of the projects of `of` that run `file`. */
export const owners = (file: string, of: readonly Project[]): readonly string[] =>
  of.filter((p) => p.include.some((g) => matchesGlob(file, g)) && !p.exclude.some((g) => matchesGlob(file, g))).map((p) => p.name);

/** The files of `files` that belong to no project of `of` or to more than one. */
export const strays = (files: readonly string[], of: readonly Project[]): readonly string[] => files.filter((f) => owners(f, of).length !== 1);

/**
 * The projects of `config` as vitest runs them: a project with `extends: true` gets the include and the exclude
 * of the root `test` before its own, as vitest merges them, so an exclude at the root drops a file from every project.
 */
export const projectsOf = (config: ViteUserConfig): readonly Project[] => {
  const root = config.test ?? {};
  return (root.projects ?? []).map((p) => {
    if (typeof p !== "object" || p instanceof Promise || p.test === undefined) throw new Error("ST-12: every project of vitest.config.ts is written inline");
    const { name, include = [], exclude = [] } = p.test;
    const inherited = p.extends === true ? root : {};
    return {
      name: typeof name === "string" ? name : "",
      include: [...(inherited.include ?? []), ...include],
      exclude: [...(inherited.exclude ?? []), ...exclude],
    };
  });
};

/** `config` itself while every file of `files` belongs to exactly one of its projects; a refusal ST-12 otherwise. */
export const checked = (config: ViteUserConfig, files: readonly string[]): ViteUserConfig => {
  const stray = strays(files, projectsOf(config));
  if (stray.length > 0) throw new Error(`ST-12: every test file of test/ belongs to exactly one project of vitest.config.ts; not so: ${stray.join(", ")}`);
  return config;
};

// ST-12: the config does not load while a test file is outside every project or in two of them. The check runs here,
// not only in test/smoke.test.ts, so an exclude that drops the smoke test stops the run instead of dropping the guard;
// it reads the object vitest gets, root and projects, not the list of projects above.

// A run is a function of its input (S0-41): one seed for fast-check, the
// budget of a property in numRuns, and time only as a safeguard above it.
export default checked(defineConfig({
  test: {
    globalSetup: ["test/support/global-setup.ts"],
    setupFiles: ["test/support/setup.ts"],
    testTimeout: SAFEGUARD_MS,
    hookTimeout: SAFEGUARD_MS,
    projects: projects.map(({ name, include, exclude }) => ({ extends: true, test: { name, include: [...include], exclude: [...exclude] } })),
  },
}), testFiles(fileURLToPath(new URL(".", import.meta.url))));
