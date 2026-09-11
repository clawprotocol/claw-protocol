import { defineConfig, devices } from "@playwright/test";

process.env.VITE_CLAW_API_BASE ??= "http://127.0.0.1:4176";
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/phase4b51",
  fullyParallel: true,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  use: {
    baseURL: "http://127.0.0.1:4176",
    trace: "off",
    channel: "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, channel: "chrome" },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4176",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: process.env.PHASE4B51_REUSE_VITE === "1",
    timeout: 120000,
    env: {
      ...process.env,
      VITE_CLAW_SUPPRESS_API_BASE_LOG: "1",
      VITE_CLAW_API_BASE: "http://127.0.0.1:4176",
      VITE_SUPABASE_URL: "http://127.0.0.1:4176/__supabase",
      VITE_SUPABASE_ANON_KEY: "phase4b51-test-anon-key",
      VITE_CLAW_FEATURE_SUPABASE_AUTH: "1",
    },
  },
});
