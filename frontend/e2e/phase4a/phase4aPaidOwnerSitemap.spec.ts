import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import {
  assertPhase4aCoverageComplete,
  listPhase4aExamplePaths,
  listPhase4aPaidOnlyRoutes,
  phase4aScenarioForRoute,
} from "../../src/launch/phase4aPaidSitemapCoverage";
import {
  PHASE4A_IDS,
  PHASE4A_ORG_A,
  PHASE4A_ORG_B,
  PHASE4A_PAID_USER,
  PHASE4A_PARTY_0,
  PHASE4A_TITLE,
  seedPhase4aFreeUser,
  seedPhase4aPaidOwner,
  seedPhase4aSignedOut,
} from "./phase4aPaidOwnerFixtures";

const LOADING_ONLY = /Checking your session|Checking access|Loading receipt|create-entitlement-loading/i;
const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;

function attachPageGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(String(err));
  });
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (CONSOLE_NOISE.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

async function waitForSettledScreen(page: Page) {
  await page.waitForFunction(() => {
    const h1 = document.querySelector("h1");
    const auth = document.querySelector('[data-testid="auth-dashboard-required"]');
    const loading = document.querySelector('[data-testid="auth-dashboard-loading"]');
    if (loading) return false;
    return Boolean(h1?.textContent?.trim() || auth);
  });
}

async function assertNoBlankOrHomeFallback(page: Page, path: string) {
  await expect(page.locator("body")).not.toHaveText(/^\s*$/);
  const url = new URL(page.url());
  expect(url.pathname === "/" && !path.startsWith("/app/affiliate") && !path.startsWith("/app/opportunity")).toBeFalsy();
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  await expect(h1).not.toHaveText(LOADING_ONLY);
}

async function assertMobileFit(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 500) return;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "mobile horizontal overflow").toBeLessThanOrEqual(1);
}

async function assertIdentityStable(page: Page) {
  const org = await page.evaluate(() => localStorage.getItem("claw_org_id"));
  expect(org).toBe(PHASE4A_ORG_A);
  const name = await page.evaluate(() => localStorage.getItem("claw_user_display_name"));
  expect(name).toBe(PHASE4A_PAID_USER.name);
}

async function assertPaidOwnerRouteHealthy(page: Page, routeId: string, path: string) {
  const scenario = phase4aScenarioForRoute(routeId);
  if (!scenario) throw new Error(`Missing Phase 4A scenario for ${routeId}`);
  const guards = attachPageGuards(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForSettledScreen(page);
  await assertNoBlankOrHomeFallback(page, path);
  const heading = page.locator("h1").first();
  await expect(heading).toHaveText(scenario.heading);
  const primary = page
    .getByRole("button", { name: scenario.primaryAction })
    .locator("visible=true")
    .or(page.getByRole("link", { name: scenario.primaryAction }).locator("visible=true"));
  await expect(primary.first()).toBeVisible();
  await expect(page.getByText(/Something went wrong|Unexpected application error/i)).toHaveCount(0);
  await assertIdentityStable(page);
  await assertMobileFit(page);
  guards.assertClean();
}

test.describe("Phase 4A paid-owner sitemap", () => {
  test("fails when a new authenticated or paid manifest route lacks a browser scenario", () => {
    expect(() => assertPhase4aCoverageComplete()).not.toThrow();
  });

  for (const { routeId, path } of listPhase4aExamplePaths()) {
    test(`paid owner reaches ${routeId} ${path}`, async ({ page }) => {
      await seedPhase4aPaidOwner(page);
      await assertPaidOwnerRouteHealthy(page, routeId, path);
    });
  }

  for (const { routeId, path } of listPhase4aExamplePaths()) {
    test(`signed-out direct entry to ${routeId} ${path} preserves a safe return`, async ({ page }) => {
      const guards = attachPageGuards(page);
      await seedPhase4aSignedOut(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForSettledScreen(page);
      await expect(page.getByTestId("auth-dashboard-required")).toBeVisible();
      await expect(page.locator("h1").first()).toHaveText(/Sign in required|Sign in to continue to secure checkout/i);
      await page.getByTestId("auth-dashboard-sign-in").click();
      await expect(page).toHaveURL(/\/app\/sign-in\?next=/);
      const next = new URL(page.url()).searchParams.get("next") || "";
      expect(next.startsWith("/app")).toBe(true);
      expect(next.includes("://")).toBe(false);
      void routeId;
      await assertMobileFit(page);
      guards.assertClean();
    });
  }

  for (const route of listPhase4aPaidOnlyRoutes()) {
    for (const path of route.examplePaths) {
      test(`free user is denied or upsold on paid route ${route.id} ${path}`, async ({ page }) => {
        const guards = attachPageGuards(page);
        await seedPhase4aFreeUser(page);
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await waitForSettledScreen(page);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(
          page.getByText(/Upgrade to Power|Upgrade|Pro|not available|Sign in required/i).first(),
        ).toBeVisible();
        await expect(page.getByText(PHASE4A_PARTY_0)).toHaveCount(0);
        await assertMobileFit(page);
        guards.assertClean();
      });
    }
  }

  const fixtureStates: { name: string; path: string; id: string }[] = [
    { name: "draft", path: `/app/ready/${PHASE4A_IDS.draft}`, id: PHASE4A_IDS.draft },
    { name: "pending_review", path: `/app/review-changes/${PHASE4A_IDS.pending}`, id: PHASE4A_IDS.pending },
    { name: "accepted_frozen", path: `/app/agreements/${PHASE4A_IDS.frozen}/view`, id: PHASE4A_IDS.frozen },
    { name: "sent", path: `/app/send/${PHASE4A_IDS.sent}`, id: PHASE4A_IDS.sent },
    { name: "partially_signed", path: `/app/signing-status/${PHASE4A_IDS.partial}`, id: PHASE4A_IDS.partial },
    { name: "executed", path: `/app/agreements/${PHASE4A_IDS.executed}/view-signed`, id: PHASE4A_IDS.executed },
    { name: "receipt", path: `/app/receipts/${PHASE4A_IDS.receipt}`, id: PHASE4A_IDS.receipt },
    { name: "field_review", path: `/app/field-review/${PHASE4A_IDS.analysis}`, id: PHASE4A_IDS.analysis },
  ];
  for (const row of fixtureStates) {
    test(`owned ${row.name} fixture keeps agreement identity ${row.id}`, async ({ page }) => {
      const guards = attachPageGuards(page);
      await seedPhase4aPaidOwner(page);
      await page.goto(row.path, { waitUntil: "domcontentloaded" });
      await waitForSettledScreen(page);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(row.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
      await assertIdentityStable(page);
      await assertMobileFit(page);
      guards.assertClean();
    });
  }

  test("wrong-organization records never display customer content", async ({ page }) => {
    const guards = attachPageGuards(page);
    await seedPhase4aPaidOwner(page);
    await page.addInitScript((orgId) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
      } catch {
        /* ignore */
      }
    }, PHASE4A_ORG_B);
    await page.goto(`/app/agreements/${PHASE4A_IDS.otherOrg}/view`, { waitUntil: "domcontentloaded" });
    await waitForSettledScreen(page);
    await expect(page.getByText(PHASE4A_PARTY_0)).toHaveCount(0);
    await expect(page.getByText(PHASE4A_TITLE)).toHaveCount(0);
    await expect(page.locator("h1").first()).toBeVisible();
    guards.assertClean();
  });

  test("missing agreement and receipt IDs stay closed", async ({ page }) => {
    const guards = attachPageGuards(page);
    await seedPhase4aPaidOwner(page);
    await page.goto(`/app/agreements/${PHASE4A_IDS.missing}/view`, { waitUntil: "domcontentloaded" });
    await waitForSettledScreen(page);
    await expect(page.getByText(PHASE4A_PARTY_0)).toHaveCount(0);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.goto(`/app/receipts/missing-usage`, { waitUntil: "domcontentloaded" });
    await waitForSettledScreen(page);
    await expect(page.getByText(/couldn’t load this receipt|Could not load|not found|missing/i).first()).toBeVisible();
    guards.assertClean();
  });

  test("retryable workspace-index failure is honest", async ({ page }) => {
    const guards = attachPageGuards(page);
    await seedPhase4aPaidOwner(page);
    await page.route("**/api/agreements/workspace-index**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "unavailable" }),
      });
    });
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await waitForSettledScreen(page);
    await expect(page.locator("h1").first()).toHaveText(/Dashboard/i);
    await expect(page.getByText(/couldn’t reach|Try again|Could not load your agreements/i).first()).toBeVisible();
    guards.assertClean();
  });
});
