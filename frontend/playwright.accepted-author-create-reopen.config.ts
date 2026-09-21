import { defineConfig, devices } from "@playwright/test";

const api = process.env.CORE_PAID_JOURNEY_LIVE_API || "http://127.0.0.1:4690";
const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN || "http://127.0.0.1:4691";
const outputDir =
  process.env.ACCEPTED_AUTHOR_REOPEN_OUTPUT ||
  "../evals/commercial-readiness/results/accepted-author-create-reopen/local";

process.env.VITE_CLAW_API_BASE ??= api;
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/core-paid-journey-live",
  testMatch: "acceptedAuthorCreateReopen.live.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  forbidOnly: true,
  outputDir,
  use: {
    baseURL: origin,
    trace: "off",
    screenshot: "only-on-failure",
    channel: "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, channel: "chrome" },
    },
  ],
});
