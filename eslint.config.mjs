import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // One-off diagnostics and migration helpers are not application code.
    // Some were committed before /scratch was added to .gitignore.
    "scratch/**",
    "search_realtime.js",
  ]),
  {
    rules: {
      // Legacy boundaries still deserialize untyped Supabase and carrier data.
      // Keep the debt visible while allowing new blocking checks to be useful.
      "@typescript-eslint/no-explicit-any": "warn",
      // Existing controlled inputs intentionally mirror incoming record values.
      // Refactor these incrementally instead of changing every form at once.
      "react-hooks/set-state-in-effect": "warn",
      // Copy containing apostrophes/quotes is not a runtime correctness issue.
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
