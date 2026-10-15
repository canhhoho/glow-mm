import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// E2E chạy trên DB riêng (glow_test) + bản build production ở cổng 3100.
config({ path: ".env.test", override: true, quiet: true });
// Cho phép trỏ DB test khác (vd khi không có Docker) mà không đụng DATABASE_URL của dev.
if (process.env.E2E_DATABASE_URL) process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.APP_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: `${process.env.APP_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { ...(process.env as Record<string, string>), PORT: "3100" },
  },
});
