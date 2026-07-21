/**
 * E2E harness smoke — proves Playwright discovery, env resolution, and homepage load.
 */
import { expect, test } from "@playwright/test";
import { readRuntimeEnvironment } from "../src/config/runtimeEnvironment";
import { getLawDogApiBase } from "../src/lib/clawApi";

test.describe("E2E harness", () => {
  test("runtime environment resolves in Node (Playwright worker)", () => {
    const env = readRuntimeEnvironment();
    expect(env.isTest).toBe(false);
    expect(typeof env.apiBaseUrl).toBe("string");
    expect(env.paymentBypassEnabled).toBe(false);
    expect(getLawDogApiBase()).toBeTruthy();
  });

  test("production modules with top-level API base do not crash on import", async () => {
    const mod = await import("../src/agreement/recipientAccessApi");
    expect(typeof mod.mintRecipientAccessTokenResult).toBe("function");
  });

  test("anonymous homepage opens without console crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(errors.filter((e) => e.includes("import.meta"))).toHaveLength(0);
  });

  test("API base URL matches Playwright webServer config", () => {
    expect(getLawDogApiBase()).toBe("http://127.0.0.1:4173");
  });
});
