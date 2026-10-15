import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration test chạy trên DB test (glow_test) — KHÔNG bao giờ trỏ vào DB dev/production.
config({ path: ".env.test", override: true, quiet: true });
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
process.env.DIRECT_DATABASE_URL = "";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
