import { defineConfig, devices } from "@playwright/test";

const api = process.env.CORE_PAID_JOURNEY_LIVE_API || "http://127.0.0.1:4188";
const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN || "http://127.0.0.1:4189";
const outputDir =
  process.env.CORE_PAID_JOURNEY_LIVE_OUTPUT ||
  "../evals/commercial-readiness/results/core-paid-journey-acceptance/local-live";

process.env.VITE_CLAW_API_BASE ??= api;
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/core-paid-journey-live",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 420_000,
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
});
