import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b4EsignDualModeRoutes } from "../../src/launch/phase4b4EsignDualModeCoverage";
import {
  PHASE4B4_DOCUMENT_ID,
  PHASE4B4_FORGED_BODY,
  PHASE4B4_SIGNER_ROLE_1,
  PHASE4B4_TOKENS,
  createPhase4b4FixtureState,
  phase4b4OwnerHref,
  phase4b4RecipientHref,
  seedPhase4b4Owner,
  seedPhase4b4Recipient,
} from "./phase4b4EsignDualModeFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;

function attachGuards(page: Page, tokens: string[]) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const leaked: string[] = [];
  const noteLeak = (text: string) => {
    for (const token of tokens) {
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

async function assertNoPaper(page: Page) {
  const body = page.locator("body");
  await expect(body).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
  await expect(body).not.toContainText(PHASE4B4_FORGED_BODY);
  await expect(page.getByTestId("esign-recipient-shell")).toHaveCount(0);
  await expect(page.getByTestId("esign-finish-signing")).toHaveCount(0);
}

test.describe("Phase 4B.4 /app/esign dual-mode authority", () => {
  test("fails closed if query-sensitive /app/esign access classification is lost", () => {
    expect(() => assertPhase4b4EsignDualModeRoutes()).not.toThrow();
  });

  test("valid owner bridge loads the server document and not local paper", async ({ page }) => {
    const state = createPhase4b4FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B4_TOKENS));
    await seedPhase4b4Owner(page, "owner", state);
    await page.goto(phase4b4OwnerHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /prepare signature links/i })).toBeVisible();
    await expect(page.getByTestId("auth-dashboard-required")).toHaveCount(0);
    await expect(page.getByTestId("esign-unavailable")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(PHASE4B4_FORGED_BODY);
    await expect.poll(() => state.ownerContentHits.length).toBeGreaterThan(0);
    expect(state.packetHits, state.packetHits.join("\n")).toEqual([]);
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("wrong-owner and signed-out owner bridge fail closed", async ({ page }) => {
    const wrong = createPhase4b4FixtureState();
    await seedPhase4b4Owner(page, "other", wrong);
    await page.goto(phase4b4OwnerHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await assertNoPaper(page);
    expect(wrong.ownerContentHits.length).toBeGreaterThan(0);

    const signedOut = createPhase4b4FixtureState();
    const fresh = await page.context().newPage();
    await seedPhase4b4Owner(fresh, "signed_out", signedOut);
    await fresh.goto(phase4b4OwnerHref(), { waitUntil: "domcontentloaded" });
    await expect(fresh.getByTestId("auth-dashboard-required")).toBeVisible();
    await expect(fresh.getByRole("heading", { name: /sign in required/i })).toBeVisible();
    await expect(fresh.getByTestId("esign-owner-prepare")).toHaveCount(0);
    await expect(fresh.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    expect(signedOut.ownerContentHits, signedOut.ownerContentHits.join("\n")).toEqual([]);
    await fresh.close();
  });

  test("valid recipient first-open strips the token, reloads from server, and isolates assigned fields", async ({
    page,
  }) => {
    const state = createPhase4b4FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B4_TOKENS));
    await seedPhase4b4Recipient(page, state);
    await page.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-shell")).toBeVisible();
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toBeVisible();
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.getByTestId("esign-assigned-field")).toHaveCount(1);
    await expect(page.getByTestId("esign-other-signer-field")).toHaveCount(1);
    await expect(page.getByTestId("esign-assigned-field").locator("input")).toBeVisible();
    await expect(page.getByTestId("esign-other-signer-field").locator("input")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(PHASE4B4_FORGED_BODY);
    const href = page.url();
    expect(href.includes("t="), href).toBeFalsy();
    expect(href.includes(PHASE4B4_TOKENS.signParty1), href).toBeFalsy();
    expect(href).toContain("vs01_recipient_sign=1");
    expect(state.ownerOnlyHits, state.ownerOnlyHits.join("\n")).toEqual([]);
    expect(state.validateHits.length).toBeGreaterThan(0);
    expect(state.packetHits.length).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-shell")).toBeVisible();
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    expect(state.validateHits.length).toBeGreaterThan(1);
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("completion is one-time, replay-safe, and attributed by persisted ids", async ({ page }) => {
    const state = createPhase4b4FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B4_TOKENS));
    await seedPhase4b4Recipient(page, state);
    await page.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-assigned-field")).toBeVisible();
    await page.getByTestId("esign-assigned-field").locator("input").fill("Casey Contoso");
    await page.getByTestId("esign-recipient-consent").check();
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    expect(state.completeHits).toHaveLength(1);
    expect(state.completeHits[0]?.signerRoleId).toBe(PHASE4B4_SIGNER_ROLE_1);
    expect(state.completeHits[0]?.participantId).toBe("p-contoso");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    await page.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    if (await page.getByTestId("esign-finish-signing").count()) {
      await page.getByTestId("esign-assigned-field").locator("input").fill("Casey Contoso");
      await page.getByTestId("esign-recipient-consent").check();
      await page.getByTestId("esign-finish-signing").click();
    }
    expect(state.completeHits.length).toBeGreaterThanOrEqual(1);
    expect(state.completeHits.every((row) => row.signerRoleId === PHASE4B4_SIGNER_ROLE_1)).toBe(true);
    expect(state.signedRoles.size).toBe(1);
    await assertMobileFit(page);
    guards.assertClean();
  });

  test("bare, malformed, and ambiguous esign entry reveal no document or signer information", async ({ page }) => {
    const state = createPhase4b4FixtureState();
    await seedPhase4b4Recipient(page, state);
    await page.goto(`/app/esign/${PHASE4B4_DOCUMENT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await assertNoPaper(page);
    expect(state.packetHits, state.packetHits.join("\n")).toEqual([]);
    expect(state.ownerContentHits, state.ownerContentHits.join("\n")).toEqual([]);

    await page.goto(`/app/esign/${PHASE4B4_DOCUMENT_ID}?vs01_recipient_sign=1`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await assertNoPaper(page);

    await page.goto(
      `/app/esign/${PHASE4B4_DOCUMENT_ID}?agreement_bridge=1&vs01_recipient_sign=1`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("esign-unavailable").or(page.getByTestId("auth-dashboard-required"))).toBeVisible();
    await assertNoPaper(page);
  });

  test("token tamper, packet mismatch, and missing server packet fail closed", async ({ page }) => {
    const tamper = createPhase4b4FixtureState();
    await seedPhase4b4Recipient(page, tamper);
    await page.goto(phase4b4RecipientHref(PHASE4B4_TOKENS.expired), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await assertNoPaper(page);

    const missing = createPhase4b4FixtureState();
    missing.missingPacket = true;
    const missingPage = await page.context().newPage();
    await seedPhase4b4Recipient(missingPage, missing);
    await missingPage.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(missingPage.getByTestId("esign-unavailable")).toBeVisible();
    await expect(missingPage.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await missingPage.close();

    const mismatch = createPhase4b4FixtureState();
    mismatch.mismatchRevision = true;
    const mismatchPage = await page.context().newPage();
    await seedPhase4b4Recipient(mismatchPage, mismatch);
    await mismatchPage.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(mismatchPage.getByTestId("esign-unavailable")).toBeVisible();
    await expect(mismatchPage.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await mismatchPage.close();
  });

  test("retryable network failure offers retry and does not use local paper", async ({ page }) => {
    const state = createPhase4b4FixtureState();
    state.failNetwork = true;
    await seedPhase4b4Recipient(page, state);
    await page.goto(phase4b4RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await expect(page.getByTestId("esign-retry")).toBeVisible();
    await assertNoPaper(page);
    await expect(page.locator("body")).toContainText(/couldn’t reach|try again/i);

    state.failNetwork = false;
    await page.getByTestId("esign-retry").click();
    await expect(page.getByTestId("esign-recipient-shell")).toBeVisible();
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.getByTestId("esign-finish-signing")).toBeVisible();
    await assertMobileFit(page);
  });
});
