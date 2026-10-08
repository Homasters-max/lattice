import { readdirSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
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

// ST-12: the config does not load while a test file is outside every project or in two of them. The check runs here,
// not only in test/smoke.test.ts, so an exclude that drops the smoke test stops the run instead of dropping the guard.
const stray = strays(testFiles(fileURLToPath(new URL(".", import.meta.url))), projects);
if (stray.length > 0) throw new Error(`ST-12: every test file of test/ belongs to exactly one project of vitest.config.ts; not so: ${stray.join(", ")}`);

// A run is a function of its input (S0-41): one seed for fast-check, the
// budget of a property in numRuns, and time only as a safeguard above it.
export default defineConfig({
  test: {
    globalSetup: ["test/support/global-setup.ts"],
    setupFiles: ["test/support/setup.ts"],
    testTimeout: SAFEGUARD_MS,
    hookTimeout: SAFEGUARD_MS,
    projects: projects.map(({ name, include, exclude }) => ({ extends: true, test: { name, include: [...include], exclude: [...exclude] } })),
  },
});
