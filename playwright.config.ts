import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/env";

/**
 * Browser tests. They start their own copies of everything:
 *   - the app (`next dev` from a separate build folder, so a dev server you have open is not disturbed),
 *   - a stand-in for Serper (no credits are ever spent),
 *   - a throwaway database, rebuilt from the migrations and seeded by tests/e2e/global-setup.ts.
 * Emails land in a file (MAIL_OUTBOX_FILE) that the tests read the links from.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // one shared database and server
  retries: process.env.CI ? 2 : 1, // a test that passes on retry is reported as flaky, not hidden
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E.appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/serper-stub.mjs",
      url: `${E2E.serperUrl}/health`,
      reuseExistingServer: false,
      env: { SERPER_STUB_PORT: String(E2E.serperPort) },
    },
    {
      command: `npx next dev -p ${E2E.appPort}`,
      url: `${E2E.appUrl}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: E2E.dbUrl,
        DIRECT_URL: E2E.dbUrl,
        APP_URL: E2E.appUrl,
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
        MAIL_OUTBOX_FILE: E2E.outboxFile,
        SERPER_API_KEY: "e2e-key",
        SERPER_BASE_URL: E2E.serperUrl,
        CRON_SECRET: E2E.cronSecret,
        // Everything below would otherwise come from a developer's own .env.local.
        SMTP_HOST: "",
        INTERNAL_APP_URL: "",
        NEXT_PUBLIC_IDLE_MINUTES: "",
      },
    },
  ],
});
