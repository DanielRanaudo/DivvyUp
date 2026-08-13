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
    // Build output from the end-to-end suite's own sandbox build.
    ".next-e2e/**",
    // Local Supabase CLI state, written by `supabase start`. Gitignored, so CI
    // never sees it, but it ships a generated edge-runtime index.ts that fails
    // lint on any machine that has run the database tests.
    "supabase/.temp/**",
    "supabase/.branches/**",
  ]),
]);

export default eslintConfig;
