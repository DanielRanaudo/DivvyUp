import { defineConfig, devices } from "@playwright/test";

// The smoke test drives sandbox mode, which keeps everything in memory. That
// means the whole money path can be exercised in CI with no Supabase project,
// no test accounts, and nothing to clean up afterwards.
//
//   npx playwright install chromium   # once
//   npm run test:e2e
const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
const E2E_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL: E2E_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build in its own dist directory and on its own port, so an
    // ordinary `npm run dev` is neither reused (it talks to the real Supabase)
    // nor disturbed. Next refuses to run two dev servers on one project anyway.
    command: `npm run build:e2e && npm run start:e2e -- --port ${E2E_PORT}`,
    url: E2E_URL,
    reuseExistingServer: !process.env.CI,
    // Long enough to cover a cold build.
    timeout: 300_000,
  },
});
