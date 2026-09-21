import { defineConfig, devices } from "@playwright/test";

process.env.VITE_CLAW_API_BASE ??= "http://127.0.0.1:4180";
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/phase4c22",
  fullyParallel: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  forbidOnly: true,
  use: {
    baseURL: "http://127.0.0.1:4180",
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
    command: "npm run dev -- --host 127.0.0.1 --port 4180",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: process.env.PHASE4C22_REUSE_VITE === "1",
    timeout: 120000,
    env: {
      ...process.env,
      VITE_CLAW_SUPPRESS_API_BASE_LOG: "1",
      VITE_CLAW_API_BASE: "http://127.0.0.1:4180",
      VITE_SUPABASE_URL: "http://127.0.0.1:4180/__supabase",
      VITE_SUPABASE_ANON_KEY: "phase4c22-test-anon-key",
      VITE_CLAW_FEATURE_SUPABASE_AUTH: "1",
    },
  },
});
