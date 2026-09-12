import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4c21QuickIntegrityContracts } from "../../src/launch/phase4c21QuickIntegrityCoverage";
import { QUICK_PDF_HINT_KEY } from "../../src/launch/simpleProduct/quickPdfUpload";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  PHASE4C2_AGREEMENT_ID,
  PHASE4C2_DOCUMENT_ID,
  PHASE4C2_OWNER,
  PHASE4C2_PDF_SHA,
  PHASE4C2_RECEIPT_DIGEST,
  PHASE4C2_RECEIPT_ID,
  PHASE4C2_RECIPIENT,
  PHASE4C2_RECIPIENT_PARTY_ID,
  PHASE4C2_REISSUED,
  PHASE4C2_TOKEN,
  createPhase4c2State,
  installPhase4c2ApiMocks,
  phase4c2RecipientHref,
  seedPhase4c2Owner,
} from "../phase4c2/phase4c2QuickCompletionFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;
const RECOVERED = /There was an error during concurrent rendering but React was able to recover/;

function attachGuards(page: Page, secrets: string[]) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const leaked: string[] = [];
  const note = (text: string) => {
    for (const secret of secrets) {
      if (secret && text.includes(secret)) leaked.push(text.slice(0, 240));
    }
  };
  page.on("pageerror", (err) => {
    const text = String(err);
    if (RECOVERED.test(text)) return;
    pageErrors.push(text);
    note(text);
  });
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    note(text);
    if (msg.type() !== "error") return;
    if (CONSOLE_NOISE.test(text) || RECOVERED.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
      expect(leaked, leaked.join("\n")).toEqual([]);
    },
  };
}

async function resumeDetails(page: Page) {
  await page.addInitScript(
    ({ key, id }) => {
      try {
        sessionStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    },
    { key: QUICK_PDF_HINT_KEY, id: PHASE4C2_DOCUMENT_ID },
  );
  await seedPhase4c2Owner(page);
}

async function reachParties(page: Page) {
  await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quick-intake-pdf-details")).toBeVisible({ timeout: 20_000 });
  if (await page.getByTestId("quick-pdf-completion").count()) return;
  await page.getByTestId("quick-intake-pdf-continue").click();
  await expect(page.getByTestId("quick-pdf-completion")).toBeVisible();
}

async function fillValidParties(page: Page) {
  await page.getByTestId("quick-pdf-owner-name").fill(PHASE4C2_OWNER.name);
  await page.getByTestId("quick-pdf-owner-email").fill(PHASE4C2_OWNER.email);
  await page.getByTestId("quick-pdf-recipient-name").fill(PHASE4C2_RECIPIENT.name);
  await page.getByTestId("quick-pdf-recipient-email").fill(PHASE4C2_RECIPIENT.email);
}

async function placeOnPageTwo(page: Page) {
  await expect(page.getByTestId("quick-pdf-page-1")).toBeVisible();
  await page.getByTestId("quick-pdf-place-role-owner").click();
  await page.getByTestId("quick-pdf-page-surface-1").click({ position: { x: 80, y: 80 } });
  await page.getByTestId("quick-pdf-place-role-recipient").click();
  await page.getByTestId("quick-pdf-page-surface-1").click({ position: { x: 220, y: 80 } });
}

test.describe("Phase 4C.2.1 Quick integrity", () => {
  test("fails closed if uploaded-PDF integrity contracts are lost", () => {
    expect(() => assertPhase4c21QuickIntegrityContracts()).not.toThrow();
  });

  test("places on page 2, owner ceremony is required, and prepare does not sign", async ({ page }) => {
    const state = createPhase4c2State();
    const guards = attachGuards(page, [PHASE4C2_TOKEN, PHASE4C2_REISSUED]);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await reachParties(page);
    await fillValidParties(page);
    await page.getByTestId("quick-pdf-parties-save").click();
    await expect(page.getByTestId("quick-pdf-place")).toBeVisible();
    await placeOnPageTwo(page);
    await page.getByTestId("quick-pdf-place-save").click();
    await expect(page.getByTestId("quick-pdf-owner-sign")).toBeVisible();
    await expect(page.getByTestId("quick-pdf-owner-agree-sign")).toBeDisabled();
    expect(state.ownerCompleteHits).toBe(0);
    await page.getByTestId("quick-pdf-owner-signature").fill(PHASE4C2_OWNER.name);
    await page.getByTestId("quick-pdf-owner-consent").check();
    await page.getByTestId("quick-pdf-owner-agree-sign").click();
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible();
    const signed = state.ownerCompleteHits;
    await page.getByTestId("quick-pdf-prepare").click();
    expect(state.prepareHits).toBeGreaterThanOrEqual(1);
    expect(state.ownerCompleteHits).toBe(signed);
    await expect(page.getByTestId("quick-pdf-owner-only-receipt")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("LAWDOG_QUICK_PDF_ENVELOPE_V1");
    guards.assertClean();
  });

  test("owner reissue invalidates the previous token", async ({ page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("quick-pdf-reissue").click();
    expect(state.reissueHits).toBeGreaterThanOrEqual(1);
    expect(state.activeToken).toBe(PHASE4C2_REISSUED);
    await expect(page.locator("body")).not.toContainText(PHASE4C2_REISSUED);
  });

  test("old token fails after reissue and the new-browser recipient signs only assigned fields", async ({ browser }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    state.activeToken = PHASE4C2_REISSUED;

    const stale = await browser.newContext();
    const stalePage = await stale.newPage();
    await installPhase4c2ApiMocks(stalePage, state);
    await stalePage.goto(phase4c2RecipientHref(PHASE4C2_TOKEN), { waitUntil: "domcontentloaded" });
    await expect(stalePage.getByTestId("esign-unavailable")).toBeVisible();
    await expect(stalePage.getByTestId("esign-assigned-field")).toHaveCount(0);
    await stale.close();

    const fresh = await browser.newContext();
    const recip = await fresh.newPage();
    const guards = attachGuards(recip, [PHASE4C2_REISSUED]);
    await installPhase4c2ApiMocks(recip, state);
    await recip.goto(phase4c2RecipientHref(PHASE4C2_REISSUED), { waitUntil: "domcontentloaded" });
    await expect(recip).toHaveURL(/\/app\/esign\//);
    await expect(recip.getByTestId("esign-recipient-shell")).toBeVisible({ timeout: 20_000 });
    await expect(recip.getByTestId("esign-assigned-field").locator("input").first()).toBeVisible();
    await expect(recip.getByTestId("esign-other-signer-field").locator("input")).toHaveCount(0);
    await recip.getByTestId("esign-assigned-field").locator("input").first().fill(PHASE4C2_RECIPIENT.name);
    await recip.getByTestId("esign-finish-signing").click();
    await expect(recip.getByTestId("esign-recipient-complete")).toBeVisible();
    expect(state.completeHits[0]?.signerRoleId).toBe(RECIPIENT_ROLE_ID);
    expect(state.completeHits[0]?.participantId).toBe(PHASE4C2_RECIPIENT_PARTY_ID);
    guards.assertClean();
    await fresh.close();
  });

  test("refresh keeps one receipt and dashboard/verify never render padded metadata as paper", async ({ page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    state.signedRoles.add(RECIPIENT_ROLE_ID);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-fully-executed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-receipt-id")).toHaveText(`Receipt ${PHASE4C2_RECEIPT_ID}`);
    await page.getByTestId("quick-pdf-receipt-refresh").click();
    await expect(page.getByTestId("quick-pdf-receipt-digest")).toHaveText(`Digest ${PHASE4C2_RECEIPT_DIGEST}`);
    await expect(page.locator("body")).not.toContainText("LAWDOG_QUICK_PDF_ENVELOPE_V1");

    await page.goto(`/verify/${PHASE4C2_AGREEMENT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("public-verify-uploaded-final-pdf")).toBeVisible();
    await expect(page.locator("body")).toContainText(/Uploaded final PDF signed through LawDog/i);
    await expect(page.locator("body")).not.toContainText("LAWDOG_QUICK_PDF_ENVELOPE_V1");
  });
});
