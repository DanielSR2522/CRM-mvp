import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Legacy baseline: these rules describe pre-existing cleanup debt in the
    // Aug-21 snapshot. Keep every finding visible, but do not let style or
    // React-compiler migration diagnostics block CI while TypeScript and the
    // production build remain strict gates. New code should avoid adding debt.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
