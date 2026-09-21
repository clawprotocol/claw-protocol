import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b5AuthEntryRoutes } from "../../src/launch/phase4b5AuthEntryCoverage";
import {
  PHASE4B5_AGREEMENT_ID,
  PHASE4B5_AUTH_CODE,
  PHASE4B5_CONTINUATION_ID,
  PHASE4B5_CREATE_DEST,
  PHASE4B5_OTHER_TITLE,
  PHASE4B5_OWNER,
  PHASE4B5_RECIPIENT_TOKEN,
  createPhase4b5FixtureState,
  installPhase4b5ApiMocks,
  phase4b5CallbackPath,
  phase4b5SignInPath,
  seedPhase4b5Owner,
  stubFinalizeAuthFetch,
} from "./phase4b5AuthEntryFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;
const SENSITIVE = [PHASE4B5_CONTINUATION_ID, PHASE4B5_AUTH_CODE, PHASE4B5_RECIPIENT_TOKEN];

function attachGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const leaked: string[] = [];
  const noteLeak = (text: string) => {
    for (const token of SENSITIVE) {
      if (token && text.includes(token)) leaked.push(text.slice(0, 240));
    }
  };
  page.on("pageerror", (err) => {
    const text = String(err);
    pageErrors.push(text);
    noteLeak(text);
  });
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    noteLeak(text);
    if (msg.type() !== "error") return;
    if (CONSOLE_NOISE.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    leaked,
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
      expect(leaked, leaked.join("\n")).toEqual([]);
    },
  };
}

async function assertMobileFit(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 500) return;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "mobile horizontal overflow").toBeLessThanOrEqual(1);
}

async function assertNoForeignAgreement(page: Page) {
  await expect(page.locator("body")).not.toContainText(PHASE4B5_OTHER_TITLE);
  await expect(page.locator("body")).not.toContainText(PHASE4B5_RECIPIENT_TOKEN);
}

async function assertDidNotFollowForgedNext(page: Page) {
  const href = page.url();
  const parsed = new URL(href);
  expect(parsed.pathname, href).not.toMatch(/^\/app\.evil/);
  expect(parsed.pathname, href).not.toMatch(/^\/app\/evil/);
  expect(parsed.pathname, href).not.toMatch(/^\/reviewevil/);
  expect(parsed.pathname, href).not.toMatch(/^\/signature$/);
  expect(parsed.protocol, href).toMatch(/^https?:$/);
  await expect(page).not.toHaveURL(/continuation_id=/);
  await expect(page).not.toHaveURL(/[?&]code=/);
}

async function readOrgId(page: Page): Promise<string> {
  return page.evaluate(() => window.localStorage.getItem("claw_org_id") || "");
}

test.describe("Phase 4B.5 authenticated customer entry", () => {
  test("fails closed if sign-in/callback redirect authority is lost", () => {
    expect(() => assertPhase4b5AuthEntryRoutes()).not.toThrow();
  });

  test("email submit is single-submit, generic, and enumeration-safe", async ({ page }) => {
    const state = createPhase4b5FixtureState();
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await page.goto(phase4b5SignInPath(PHASE4B5_CREATE_DEST), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("auth-sign-in-page")).toBeVisible();
    await expect(page.getByTestId("auth-sign-in-staging")).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(PHASE4B5_RECIPIENT_TOKEN));
    await page.getByTestId("auth-sign-in-email").fill(PHASE4B5_OWNER.email);
    await page.getByTestId("auth-sign-in-submit").click();
    await expect(page.getByTestId("auth-sign-in-status")).toHaveText(/check your email/i);
    await expect(page.getByTestId("auth-sign-in-submit")).toBeDisabled();
    await page.getByTestId("auth-sign-in-submit").click({ force: true });
    expect(state.otpHits).toBe(1);
    expect(state.continuationCreates).toBe(1);
    await assertNoForeignAgreement(page);
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("email failures stay generic and do not expose provider copy", async ({ page }) => {
    const state = createPhase4b5FixtureState();
    state.otpMode = "user_not_found";
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await page.goto(phase4b5SignInPath(), { waitUntil: "domcontentloaded" });
    await page.getByTestId("auth-sign-in-email").fill(PHASE4B5_OWNER.email);
    await page.getByTestId("auth-sign-in-submit").click();
    await expect(page.getByTestId("auth-sign-in-status")).toHaveText(/could not send a sign-in link/i);
    await expect(page.locator("body")).not.toContainText("User not found");
    await expect(page.locator("body")).not.toContainText("user_not_found");
    await expect(page.getByTestId("auth-sign-in-submit")).toBeEnabled();
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("signed-in /app/sign-in redirects after render without restoring-workspace hang", async ({ page }) => {
    const state = createPhase4b5FixtureState();
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await seedPhase4b5Owner(page);
    await page.goto(phase4b5SignInPath("/app/billing"), { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app\/billing/);
    await expect(page.getByTestId("auth-callback-loading")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Restoring your workspace");
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("new-tab magic-link callback restores server continuation over forged next", async ({ page, browser }) => {
    const state = createPhase4b5FixtureState();
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await page.goto(phase4b5SignInPath(PHASE4B5_CREATE_DEST), { waitUntil: "domcontentloaded" });
    await page.getByTestId("auth-sign-in-email").fill(PHASE4B5_OWNER.email);
    await page.getByTestId("auth-sign-in-submit").click();
    await expect(page.getByTestId("auth-sign-in-status")).toHaveText(/check your email/i);

    const fresh = await browser.newContext({
      viewport: page.viewportSize() ?? { width: 1280, height: 800 },
    });
    const tab = await fresh.newPage();
    const tabGuards = attachGuards(tab);
    await installPhase4b5ApiMocks(tab, state);
    await stubFinalizeAuthFetch(tab, state);
    await seedPhase4b5Owner(tab, "email");
    await tab.goto(
      phase4b5CallbackPath({
        continuationId: PHASE4B5_CONTINUATION_ID,
        next: "/app.evil",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(tab.getByTestId("auth-callback-loading")).toBeVisible();
    await expect(tab.getByTestId("auth-callback-loading")).toHaveCount(0);
    await expect(tab.locator("body")).not.toContainText("Restoring your workspace");
    await assertDidNotFollowForgedNext(tab);
    await expect(tab).not.toHaveURL(/app\.evil/);
    expect(await readOrgId(tab)).toBe(PHASE4B5_OWNER.orgId);
    await assertNoForeignAgreement(tab);
    await assertMobileFit(tab);
    tabGuards.assertClean();
    guards.assertClean();
    await fresh.close();
  });

  test("callback reload is idempotent and fail-closed continuation stays unavailable", async ({
    page,
    browser,
  }) => {
    const state = createPhase4b5FixtureState();
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await stubFinalizeAuthFetch(page, state);
    await seedPhase4b5Owner(page, "google");
    await page.goto(
      phase4b5CallbackPath({
        continuationId: PHASE4B5_CONTINUATION_ID,
        next: "/app/evil",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("auth-callback-loading").or(page.getByTestId("auth-callback-unavailable"))).toBeVisible();
    await expect(page.getByTestId("auth-callback-loading")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Restoring your workspace");
    await assertDidNotFollowForgedNext(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("auth-callback-loading")).toHaveCount(0);
    await assertDidNotFollowForgedNext(page);

    state.finalizeMode = "expired";
    const unsigned = await browser.newContext({
      viewport: page.viewportSize() ?? { width: 1280, height: 800 },
    });
    const tab = await unsigned.newPage();
    const tabGuards = attachGuards(tab);
    await installPhase4b5ApiMocks(tab, state);
    await tab.goto(
      phase4b5CallbackPath({
        continuationId: "cont-phase4b5-expired",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(tab.getByTestId("auth-callback-unavailable")).toBeVisible();
    await expect(tab.getByTestId("auth-callback-loading")).toHaveCount(0);
    await expect(tab.getByTestId("auth-callback-retry")).toBeVisible();
    await expect(tab.getByTestId("auth-callback-dashboard")).toBeVisible();
    await expect(tab.locator("body")).not.toContainText(PHASE4B5_OTHER_TITLE);
    await tab.getByTestId("auth-callback-retry").click();
    await expect(tab).toHaveURL(/\/app\/sign-in/);
    await tab.goBack();
    await expect(tab.getByTestId("auth-callback-unavailable")).toBeVisible();
    await expect(tab.getByTestId("auth-callback-loading")).toHaveCount(0);
    await tab.getByTestId("auth-callback-dashboard").click();
    await expect(tab).toHaveURL(/\/app$/);
    await assertMobileFit(tab);
    tabGuards.assertClean();
    guards.assertClean();
    await unsigned.close();
  });

  test("recipient tokens never ride through sign-in and forged next never wins", async ({ page }) => {
    const state = createPhase4b5FixtureState();
    const guards = attachGuards(page);
    await installPhase4b5ApiMocks(page, state);
    await page.goto(
      phase4b5SignInPath(`/app/create?t=${PHASE4B5_RECIPIENT_TOKEN}`),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("auth-sign-in-page")).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(PHASE4B5_RECIPIENT_TOKEN));
    await expect(page.locator("body")).not.toContainText(PHASE4B5_RECIPIENT_TOKEN);
    await seedPhase4b5Owner(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app$/);
    await expect(page).not.toHaveURL(new RegExp(PHASE4B5_RECIPIENT_TOKEN));
    await assertNoForeignAgreement(page);
    guards.assertClean();
  });
});
