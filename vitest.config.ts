import { defineConfig } from "vitest/config";
import { SAFEGUARD_MS } from "./test/support/budget.js";

// A run is a function of its input (S0-41): one seed for fast-check, the
// budget of a property in numRuns, and time only as a safeguard above it.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/support/global-setup.ts"],
    setupFiles: ["test/support/setup.ts"],
    testTimeout: SAFEGUARD_MS,
    hookTimeout: SAFEGUARD_MS,
  },
});
