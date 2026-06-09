import { defineConfig, devices } from "@playwright/test";

/** One-off manual QA — reuses existing Vite on :5173 (proxied to backend :8000). */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 900_000,
  reporter: [["list"], ["json", { outputFile: "manual-qa-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
