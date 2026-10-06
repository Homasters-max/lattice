// Quality profile limits are written by hand until the switch; from SW the
// config is generated from the profile block (Q-08, ST-09, S0-28).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "gen/", "node_modules/", "discussion/", "plan/", "docs/"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      complexity: ["error", 10],
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
