import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  timeout: 300_000,
  outputDir: process.env.CORE_PAID_JOURNEY_LIVE_OUTPUT,
  use: { baseURL: process.env.CORE_PAID_JOURNEY_LIVE_ORIGIN, channel: 'chrome',
    screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
