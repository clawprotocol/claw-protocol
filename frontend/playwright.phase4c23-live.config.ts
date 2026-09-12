import { defineConfig, devices } from "@playwright/test";

const api = process.env.PHASE4C23_LIVE_API || "http://127.0.0.1:4182";
const origin = process.env.PHASE4C23_LIVE_ORIGIN || "http://127.0.0.1:4183";
const outputDir =
  process.env.PHASE4C23_LIVE_OUTPUT ||
  "../evals/commercial-readiness/results/phase4c23-signing-acceptance/local-live";

process.env.VITE_CLAW_API_BASE ??= api;
process.env.VITE_CLAW_SUPPRESS_API_BASE_LOG ??= "1";

export default defineConfig({
  testDir: "./e2e/phase4c23-live",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  forbidOnly: true,
  outputDir,
  use: {
    baseURL: origin,
    trace: "off",
    channel: "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, channel: "chrome" },
    },
  ],
});
