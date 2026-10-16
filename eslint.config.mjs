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
    "src/generated/**",
    "src/lib/myanmar/vendor/**",
    "playwright-report/**",
    "test-results/**",
    // Worktree của các phiên Claude Code (bản sao code + .next build) — không thuộc mã nguồn checkout này.
    ".claude/**",
  ]),
]);

export default eslintConfig;
