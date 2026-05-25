import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      ...process.env,
      /** Quiets `[CLAW] API base (once)` in Playwright-driven dev sessions (see `clawApi.ts`). */
      VITE_CLAW_SUPPRESS_API_BASE_LOG: "1",
      // Same-origin API so page.route("**/api/**") intercepts mint in e2e (dev default is :8000).
      VITE_CLAW_API_BASE: "http://127.0.0.1:4173",
    },
  },
});
