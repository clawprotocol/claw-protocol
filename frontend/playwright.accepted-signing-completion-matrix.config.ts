import { defineConfig, devices } from "@playwright/test";

const api = process.env.CORE_PAID_JOURNEY_LIVE_API || "http://127.0.0.1:4990";
const origin = process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN || "http://127.0.0.1:4991";
const outputDir =
  process.env.ACCEPTED_SIGNING_COMPLETION_MATRIX_OUTPUT ||
  "../evals/commercial-readiness/results/accepted-signing-completion-matrix/local/playwright";

process.env.VITE_CLAW_API_BASE ??= api;
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/core-paid-journey-live",
  testMatch: "acceptedSigningCompletionMatrix.live.spec.ts",
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
      name: "matrix",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, channel: "chrome" },
    },
  ],
});
