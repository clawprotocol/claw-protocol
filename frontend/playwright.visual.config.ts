import { defineConfig, devices } from "@playwright/test";

/** Visual regression for VS01 canonical signing — no dev server required. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "vs01-canonical-visual-regression.spec.tsx",
  fullyParallel: false,
  retries: 0,
  use: {
    ...devices["Desktop Chrome"],
  },
});
