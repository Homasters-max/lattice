import { configDefaults, defineConfig } from "vitest/config";
import { SAFEGUARD_MS } from "./test/support/budget.js";

// Two projects (S0-40): `tools` — the tests of the development tools in plan/tools/ and scripts/,
// `lattice` — the rest. `npm test` runs both, so every fitness test runs on every change request (ST-12);
// test/smoke.test.ts checks that every test file belongs to exactly one project.
// A run is a function of its input (S0-41): one seed for fast-check, the
// budget of a property in numRuns, and time only as a safeguard above it.
export default defineConfig({
  test: {
    globalSetup: ["test/support/global-setup.ts"],
    setupFiles: ["test/support/setup.ts"],
    testTimeout: SAFEGUARD_MS,
    hookTimeout: SAFEGUARD_MS,
    projects: [
      { extends: true, test: { name: "lattice", include: ["test/**/*.test.ts"], exclude: [...configDefaults.exclude, "test/tools/**"] } },
      { extends: true, test: { name: "tools", include: ["test/tools/**/*.test.ts"] } },
    ],
  },
});
