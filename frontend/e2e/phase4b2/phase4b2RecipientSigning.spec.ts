import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b2RecipientSigningRoutes } from "../../src/launch/phase4b2RecipientSigningCoverage";
import {
  PHASE4B2_AGREEMENT_B,
  PHASE4B2_FROZEN_BODY,
  PHASE4B2_FROZEN_LENGTH,
  PHASE4B2_FROZEN_SHA,
  PHASE4B2_LOCKED_VERSION,
  PHASE4B2_OTHER_BODY,
  PHASE4B2_PARTY_0,
  PHASE4B2_PARTY_0_NAME,
  PHASE4B2_PARTY_1,
  PHASE4B2_PARTY_1_NAME,
  PHASE4B2_SIGNER_0_NAME,
  PHASE4B2_SIGNER_0_TITLE,
  PHASE4B2_SIGNER_1_NAME,
  PHASE4B2_SIGNER_ROLE_0,
  PHASE4B2_TITLE,
  PHASE4B2_TOKENS,
  PHASE4B2_WRONG_VERSION,
  createPhase4b2FixtureState,
  primarySignHref,
  seedPhase4b2UnsignedSigner,
  type Phase4b2FixtureState,
} from "./phase4b2RecipientSigningFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;
const INVALID_LINK = /invalid or expired/i;

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

function signAction(page: Page) {
  return page.locator('[data-testid="recipient-sign-action"]:visible');
}

async function assertMobileFit(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 500) return;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "mobile horizontal overflow").toBeLessThanOrEqual(1);
}

async function assertNoOwnerChrome(page: Page) {
  await expect(page.getByTestId("auth-dashboard-required")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /sign in required|sign in to continue/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^dashboard$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^dashboard$/i })).toHaveCount(0);
}

async function assertTokenHidden(page: Page, token: string) {
  const href = page.url();
  expect(href.includes("t="), href).toBeFalsy();
  expect(href.includes("token="), href).toBeFalsy();
  expect(href.includes(token), href).toBeFalsy();
  const html = await page.content();
  expect(html.includes(token)).toBeFalsy();
}

async function assertExactFrozenPaper(page: Page) {
  await expect(page.getByTestId("recipient-sign-heading")).toHaveText("Review and sign");
  await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
  await expect(page.getByTestId("recipient-document-shell")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
  await expect(page.getByTestId("recipient-document-shell")).toContainText(PHASE4B2_PARTY_0_NAME);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B2_TITLE);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B2_PARTY_0_NAME);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B2_PARTY_1_NAME);
  const meta = page.getByTestId("recipient-review-authority-meta");
  await expect(meta).toBeVisible();
  await expect(meta).toHaveAttribute("data-locked-version-id", PHASE4B2_LOCKED_VERSION);
  await expect(meta).toHaveAttribute("data-corpus-length", String(PHASE4B2_FROZEN_LENGTH));
  await expect(meta).toHaveAttribute("data-corpus-sha256", PHASE4B2_FROZEN_SHA);
  await expect(meta).toContainText(PHASE4B2_LOCKED_VERSION);
  await expect(meta).toContainText(String(PHASE4B2_FROZEN_LENGTH));
  await expect(meta).toContainText(PHASE4B2_FROZEN_SHA);
  await expect(page.getByTestId("recipient-document-shell")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
}

function assertRecipientScopedTraffic(state: Phase4b2FixtureState, token: string) {
  expect(state.ownerOnlyHits, state.ownerOnlyHits.join("\n")).toEqual([]);
  expect(state.recipientReads.length).toBeGreaterThan(0);
  for (const row of state.recipientReads) {
    expect(row.hasAuth, row.url).toBe(false);
    expect(row.token, row.url).toBe(token);
  }
}

async function openValidSign(page: Page, href: string, token: string) {
  const state = createPhase4b2FixtureState();
  const guards = attachGuards(page, Object.values(PHASE4B2_TOKENS));
  await seedPhase4b2UnsignedSigner(page, state);
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
  await assertExactFrozenPaper(page);
  await expect(page.getByTestId("recipient-sign-identity")).toContainText(PHASE4B2_PARTY_0_NAME);
  await expect(page.getByTestId("recipient-sign-identity")).toContainText(PHASE4B2_SIGNER_0_NAME);
  await expect(page.getByTestId("recipient-sign-identity")).toContainText(PHASE4B2_SIGNER_0_TITLE);
  await expect(page.getByTestId("recipient-sign-other-parties")).toContainText(PHASE4B2_PARTY_1_NAME);
  await expect(page.getByTestId("recipient-sign-other-parties")).toContainText(PHASE4B2_SIGNER_1_NAME);
  await expect(page.getByTestId(`recipient-sign-other-field-${PHASE4B2_PARTY_1}`)).toBeDisabled();
  await expect(signAction(page)).toBeVisible();
  await expect(signAction(page)).toBeDisabled();
  await page.getByTestId("recipient-sign-consent").check();
  await expect(signAction(page)).toBeEnabled();
  await assertNoOwnerChrome(page);
  await assertTokenHidden(page, token);
  await assertMobileFit(page);
  assertRecipientScopedTraffic(state, token);
  guards.assertClean();
  return { state, guards };
}

async function assertNoPaper(page: Page, name: string) {
  await expect(page.getByTestId("journey-action-banner"), name).toBeVisible();
  await expect(page.getByTestId("journey-action-banner"), name).toContainText(INVALID_LINK);
  await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
  await expect(page.getByTestId("recipient-sign-action")).toHaveCount(0);
  await expect(page.getByTestId("recipient-review-authority-meta")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
  await expect(page.locator("body")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
  await expect(page.locator("body")).not.toContainText(PHASE4B2_FROZEN_SHA);
  await assertNoOwnerChrome(page);
}

test.describe("Phase 4B.2 recipient agreement signing", () => {
  test("fails closed if /agreements/:id/sign loses public recipient-token treatment", () => {
    expect(() => assertPhase4b2RecipientSigningRoutes()).not.toThrow();
  });

  test("valid sign-mode token paints the exact locked agreement without sign-in", async ({ page }) => {
    await openValidSign(page, primarySignHref(PHASE4B2_TOKENS.signAParty0), PHASE4B2_TOKENS.signAParty0);
    await expect(page.getByTestId("recipient-review-approve-draft")).toHaveCount(0);
    await expect(page.getByTestId("recipient-review-propose-updated-draft")).toHaveCount(0);
  });

  test("completion posts once, persists after refresh, and replay cannot add another event", async ({ page }) => {
    const token = PHASE4B2_TOKENS.signAParty0;
    const { state } = await openValidSign(page, primarySignHref(token), token);
    await signAction(page).click();
    await expect(page.getByTestId("recipient-sign-complete-status")).toBeVisible();
    await expect(page.getByTestId("recipient-sign-complete-status")).toContainText(/signed|signature/i);
    await expect(page.getByTestId("recipient-sign-action")).toHaveCount(0);
    expect(state.completeCount.get(`${"ag-phase4b2-orion"}:${PHASE4B2_PARTY_0}`)).toBe(1);
    expect(state.completeBodies).toHaveLength(1);
    expect(state.completeBodies[0]).toMatchObject({
      agreementId: "ag-phase4b2-orion",
      participant_id: PHASE4B2_PARTY_0,
      locked_version_id: PHASE4B2_LOCKED_VERSION,
      signer_role_id: PHASE4B2_SIGNER_ROLE_0,
    });
    await expect(page.getByTestId("recipient-sign-complete-status")).not.toContainText(/all required signers/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-sign-complete-status")).toBeVisible();
    await expect(page.getByTestId("recipient-document-shell")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.getByTestId("recipient-sign-action")).toHaveCount(0);
    await assertTokenHidden(page, token);
    expect(state.completeCount.get(`ag-phase4b2-orion:${PHASE4B2_PARTY_0}`)).toBe(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    expect(state.completeCount.get(`ag-phase4b2-orion:${PHASE4B2_PARTY_0}`)).toBe(1);
    expect(state.signedParties.has(`ag-phase4b2-orion:${PHASE4B2_PARTY_1}`)).toBe(false);
  });

  test("one signer cannot complete another signer or fully execute alone", async ({ page }) => {
    const token = PHASE4B2_TOKENS.signAParty0;
    const state = createPhase4b2FixtureState();
    await seedPhase4b2UnsignedSigner(page, state);
    await page.goto(
      `/agreements/ag-phase4b2-orion/sign?t=${token}&p=${PHASE4B2_PARTY_1}&v=${PHASE4B2_WRONG_VERSION}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("journey-action-banner")).toContainText(INVALID_LINK);
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    expect(state.completeCount.size).toBe(0);

    await page.goto(primarySignHref(token), { waitUntil: "domcontentloaded" });
    await expect(signAction(page)).toBeVisible();
    await page.getByTestId("recipient-sign-consent").check();
    await expect(signAction(page)).toBeEnabled();
    await signAction(page).click();
    await expect(page.getByTestId("recipient-sign-complete-status")).toBeVisible();
    expect(state.signedParties.has(`ag-phase4b2-orion:${PHASE4B2_PARTY_0}`)).toBe(true);
    expect(state.signedParties.has(`ag-phase4b2-orion:${PHASE4B2_PARTY_1}`)).toBe(false);
    await expect(page.getByTestId("recipient-sign-complete-status")).not.toContainText(/all required signers/i);
  });

  test("URL tampering cannot override token authority", async ({ page }) => {
    const token = PHASE4B2_TOKENS.signAParty0;
    const state = createPhase4b2FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B2_TOKENS));
    await seedPhase4b2UnsignedSigner(page, state);
    const cases = [
      `/agreements/ag-phase4b2-orion/sign?t=${token}&p=${PHASE4B2_PARTY_1}`,
      `/agreements/${PHASE4B2_AGREEMENT_B}/sign?t=${token}&p=${PHASE4B2_PARTY_0}`,
      `/agreements/ag-phase4b2-orion/sign?t=${token}&p=${PHASE4B2_PARTY_0}&v=${PHASE4B2_WRONG_VERSION}`,
    ];
    await page.goto(cases[0], { waitUntil: "domcontentloaded" });
    await assertNoPaper(page, "wrong-party query");
    await page.goto(cases[1], { waitUntil: "domcontentloaded" });
    await assertNoPaper(page, "wrong-agreement path");
    await page.goto(cases[2], { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
    await expect(page.getByTestId("recipient-review-authority-meta")).toHaveAttribute(
      "data-locked-version-id",
      PHASE4B2_LOCKED_VERSION,
    );
    await expect(page.getByTestId("recipient-sign-identity")).toContainText(PHASE4B2_SIGNER_0_NAME);
    await expect(page.getByTestId("recipient-sign-other-field-p-contoso")).toBeDisabled();
    guards.assertClean();
  });

  test("missing, malformed, expired, revoked, superseded, review-mode, wrong-party, wrong-role, and missing-lock tokens show no paper", async ({
    page,
  }) => {
    const state = createPhase4b2FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B2_TOKENS));
    await seedPhase4b2UnsignedSigner(page, state);
    const cases: { name: string; href: string }[] = [
      { name: "missing", href: "/agreements/ag-phase4b2-orion/sign" },
      { name: "legacy-v", href: `/agreements/ag-phase4b2-orion/sign?v=${PHASE4B2_LOCKED_VERSION}` },
      { name: "malformed", href: primarySignHref(PHASE4B2_TOKENS.malformed) },
      { name: "expired", href: primarySignHref(PHASE4B2_TOKENS.expired) },
      { name: "revoked", href: primarySignHref(PHASE4B2_TOKENS.revoked) },
      { name: "superseded", href: primarySignHref(PHASE4B2_TOKENS.superseded) },
      { name: "review-mode", href: primarySignHref(PHASE4B2_TOKENS.reviewMode) },
      { name: "wrong-agreement", href: `/agreements/${PHASE4B2_AGREEMENT_B}/sign?t=${PHASE4B2_TOKENS.signAParty0}` },
      { name: "wrong-party", href: primarySignHref(PHASE4B2_TOKENS.wrongParty) },
      { name: "wrong-role", href: primarySignHref(PHASE4B2_TOKENS.wrongRole) },
      { name: "missing-lock", href: primarySignHref(PHASE4B2_TOKENS.missingLock) },
    ];
    for (const row of cases) {
      await page.goto(row.href, { waitUntil: "domcontentloaded" });
      await assertNoPaper(page, row.name);
    }
    void PHASE4B2_FROZEN_BODY;
    void PHASE4B2_OTHER_BODY;
    guards.assertClean();
  });

  test("wrong-version and corpus-hash-mismatch tokens show no paper or signing action", async ({ page }) => {
    const state = createPhase4b2FixtureState();
    await seedPhase4b2UnsignedSigner(page, state);
    await page.goto(primarySignHref(PHASE4B2_TOKENS.wrongVersion), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    await expect(page.getByTestId("recipient-sign-action")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await page.goto(primarySignHref(PHASE4B2_TOKENS.hashMismatch), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    await expect(page.getByTestId("recipient-sign-action")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.locator("body")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
    expect(state.completeCount.size).toBe(0);
  });

  test("retryable network failure recovers without leaking cached paper or local completion", async ({ page }) => {
    const token = PHASE4B2_TOKENS.signAParty0;
    const state = createPhase4b2FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B2_TOKENS));
    state.failGets = true;
    await seedPhase4b2UnsignedSigner(page, state);
    await page.goto(primarySignHref(token), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-review-load-error")).toBeVisible();
    await expect(page.getByTestId("recipient-review-load-retry")).toBeVisible();
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.locator("body")).not.toContainText(PHASE4B2_FROZEN_SHA);
    expect(state.completeCount.size).toBe(0);

    state.failGets = false;
    await page.getByTestId("recipient-review-load-retry").click();
    await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
    await assertExactFrozenPaper(page);
    await expect(signAction(page)).toBeVisible();
    await expect(signAction(page)).toBeDisabled();
    await page.getByTestId("recipient-sign-consent").check();
    await expect(signAction(page)).toBeEnabled();
    await assertTokenHidden(page, token);
    await assertMobileFit(page);
    expect(state.completeCount.size).toBe(0);
    guards.assertClean();
  });
});
