import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4c2QuickCompletionContracts } from "../../src/launch/phase4c2QuickCompletionCoverage";
import { QUICK_PDF_HINT_KEY } from "../../src/launch/simpleProduct/quickPdfUpload";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  PHASE4C2_DOCUMENT_ID,
  PHASE4C2_OTHER_ORG,
  PHASE4C2_OWNER,
  PHASE4C2_PDF_SHA,
  PHASE4C2_RECEIPT_DIGEST,
  PHASE4C2_RECEIPT_ID,
  PHASE4C2_RECIPIENT,
  PHASE4C2_RECIPIENT_PARTY_ID,
  PHASE4C2_REISSUED,
  PHASE4C2_REVOKED,
  PHASE4C2_TOKEN,
  createPhase4c2State,
  installPhase4c2ApiMocks,
  phase4c2RecipientHref,
  seedPhase4c2Owner,
} from "./phase4c2QuickCompletionFixtures";

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

async function assertFit(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  expect(overflow, "horizontal overflow").toBe(false);
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
  await expect(page.getByTestId("quick-pdf-placed-qs_owner")).toBeVisible();
  await expect(page.getByTestId("quick-pdf-placed-qs_recipient")).toBeVisible();
}

async function ownerCeremony(page: Page) {
  await expect(page.getByTestId("quick-pdf-owner-sign")).toBeVisible();
  await page.getByTestId("quick-pdf-owner-signature").fill(PHASE4C2_OWNER.name);
  await page.getByTestId("quick-pdf-owner-consent").check();
  await page.getByTestId("quick-pdf-owner-agree-sign").click();
}

test.describe("Phase 4C.2 Quick completion", () => {
  test("fails closed if Quick completion contracts are lost", () => {
    expect(() => assertPhase4c2QuickCompletionContracts()).not.toThrow();
  });

  test("resumes 4C.1 details, rejects placeholders, and places owner/recipient fields", async ({ page }) => {
    const state = createPhase4c2State();
    const guards = attachGuards(page, [PHASE4C2_TOKEN, PHASE4C2_REVOKED, PHASE4C2_OTHER_ORG]);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await reachParties(page);
    await expect(page.getByTestId("quick-intake-pdf-id")).toHaveText(PHASE4C2_DOCUMENT_ID);
    await expect(page.getByTestId("quick-intake-pdf-hash")).toHaveText(PHASE4C2_PDF_SHA);
    await expect(page.locator("body")).toContainText(/did not draft/i);

    await page.getByTestId("quick-pdf-owner-name").fill("Owner");
    await page.getByTestId("quick-pdf-owner-email").fill("you@email.com");
    await page.getByTestId("quick-pdf-recipient-name").fill("Recipient");
    await page.getByTestId("quick-pdf-recipient-email").fill("name@email.com");
    await page.getByTestId("quick-pdf-parties-save").click();
    await expect(page.getByTestId("quick-pdf-completion-error")).toContainText(/real name|valid email|Placeholders/i);
    expect(state.envelopeCreates).toBe(0);

    await fillValidParties(page);
    const save = page.getByTestId("quick-pdf-parties-save");
    await Promise.all([save.click(), save.click()]);
    await expect(page.getByTestId("quick-pdf-place")).toBeVisible();
    expect(state.envelopeCreates).toBe(1);
    await placeOnPageTwo(page);
    await page.getByTestId("quick-pdf-place-save").click();
    await expect(page.getByTestId("quick-pdf-owner-sign")).toBeVisible();
    expect(state.fieldSaves).toBe(1);
    await assertFit(page);
    guards.assertClean();
  });

  test("owner signature is not a fully executed receipt and email is honestly unavailable", async ({ page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true });
    const guards = attachGuards(page, [PHASE4C2_TOKEN]);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await reachParties(page);
    if (await page.getByTestId("quick-pdf-parties").count()) {
      await fillValidParties(page);
      await page.getByTestId("quick-pdf-parties-save").click();
    }
    if (await page.getByTestId("quick-pdf-place").count()) {
      await placeOnPageTwo(page);
      await page.getByTestId("quick-pdf-place-save").click();
    }
    await ownerCeremony(page);
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible();
    expect(state.ownerCompleteHits).toBeGreaterThanOrEqual(1);
    const signedBeforePrepare = state.ownerCompleteHits;
    const prepare = page.getByTestId("quick-pdf-prepare");
    await Promise.all([prepare.click(), prepare.click()]);
    await expect(page.getByTestId("quick-pdf-owner-only-receipt")).toBeVisible();
    await expect(page.getByTestId("quick-pdf-delivery-state")).toContainText(/Email unavailable/i);
    await expect(page.locator("body")).not.toContainText(/email sent/i);
    await expect(page.getByTestId("quick-pdf-locked-hash")).toContainText(PHASE4C2_PDF_SHA);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(PHASE4C2_TOKEN);
    expect(page.url()).not.toContain(PHASE4C2_TOKEN);
    expect(state.prepareHits).toBeGreaterThanOrEqual(1);
    expect(state.ownerCompleteHits).toBe(signedBeforePrepare);
    expect(state.signedRoles.has(OWNER_ROLE_ID)).toBe(true);
    expect(state.signedRoles.has(RECIPIENT_ROLE_ID)).toBe(false);
    await page.getByTestId("quick-pdf-goto-receipt").click();
    await expect(page.getByTestId("quick-pdf-pending-receipt")).toBeVisible();
    await expect(page.getByTestId("quick-pdf-fully-executed")).toHaveCount(0);
    await assertFit(page);
    guards.assertClean();
  });

  test("new-browser recipient opens 4B.4, sees locked PDF fields, and completes once", async ({ browser }) => {
    const state = createPhase4c2State({
      envelopeCreated: true,
      fieldsSaved: true,
      prepared: true,
    });
    state.signedRoles.add(OWNER_ROLE_ID);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const guards = attachGuards(page, [PHASE4C2_TOKEN]);
    await installPhase4c2ApiMocks(page, state);
    await page.goto(phase4c2RecipientHref(), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-shell")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-locked-document")).toBeVisible();
    await expect(page.getByTestId("esign-assigned-field").first()).toBeVisible();
    await expect(page.getByTestId("esign-other-signer-field").first()).toBeVisible();
    await expect(page.getByTestId("esign-assigned-field").locator("input").first()).toBeVisible();
    await expect(page.getByTestId("esign-other-signer-field").locator("input")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("LAWDOG_QUICK_PDF_ENVELOPE_V1");
    expect(page.url()).not.toContain(PHASE4C2_TOKEN);
    expect(page.url()).toContain("vs01_recipient_sign=1");
    expect(state.packetHits).toBeGreaterThan(0);
    expect(state.validateHits).toBeGreaterThan(0);
    expect(state.contentHits.some((row) => row.hasRecipientToken)).toBe(true);

    await page.getByTestId("esign-assigned-field").locator("input").first().fill(PHASE4C2_RECIPIENT.name);
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    expect(state.completeHits).toHaveLength(1);
    expect(state.completeHits[0]?.signerRoleId).toBe(RECIPIENT_ROLE_ID);
    expect(state.completeHits[0]?.participantId).toBe(PHASE4C2_RECIPIENT_PARTY_ID);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    if (await page.getByTestId("esign-finish-signing").count()) {
      await page.getByTestId("esign-assigned-field").locator("input").first().fill(PHASE4C2_RECIPIENT.name);
      await page.getByTestId("esign-finish-signing").click();
    }
    expect(state.completeHits.every((row) => row.signerRoleId === RECIPIENT_ROLE_ID)).toBe(true);
    expect(state.signedRoles.size).toBe(2);
    await assertFit(page);
    guards.assertClean();
    await ctx.close();
  });

  test("owner refresh recovers pending then fully executed receipt and bundle", async ({ page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    const guards = attachGuards(page, [PHASE4C2_TOKEN]);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-owner-only-receipt")).toBeVisible();
    await expect(page.getByTestId("quick-pdf-fully-executed")).toHaveCount(0);

    state.signedRoles.add(RECIPIENT_ROLE_ID);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-fully-executed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-fully-executed")).toContainText(PHASE4C2_PDF_SHA);
    await expect(page.getByTestId("quick-pdf-receipt-id")).toHaveText(`Receipt ${PHASE4C2_RECEIPT_ID}`);
    await expect(page.getByTestId("quick-pdf-receipt-digest")).toHaveText(`Digest ${PHASE4C2_RECEIPT_DIGEST}`);
    await page.getByTestId("quick-pdf-bundle").click();
    await expect.poll(() => state.bundleGets).toBeGreaterThan(0);
    await page.getByTestId("quick-pdf-receipt-refresh").click();
    await expect(page.getByTestId("quick-pdf-receipt-id")).toHaveText(`Receipt ${PHASE4C2_RECEIPT_ID}`);
    await expect(page.getByTestId("quick-pdf-receipt-digest")).toHaveText(`Digest ${PHASE4C2_RECEIPT_DIGEST}`);
    expect(state.receiptGets).toBeGreaterThan(0);
    await assertFit(page);
    guards.assertClean();
  });

  test("401, 403, hash mismatch, revoked token, and retryable network fail closed", async ({ page, browser }) => {
    const state = createPhase4c2State({ failNetwork: true });
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await reachParties(page);
    await fillValidParties(page);
    await page.getByTestId("quick-pdf-parties-save").click();
    await expect(page.getByTestId("quick-pdf-completion-error")).toContainText(/connection|try again/i);
    expect(state.envelopeCreates).toBe(0);

    state.failNetwork = false;
    state.hashMismatch = true;
    await page.getByTestId("quick-pdf-parties-save").click();
    await expect(page.getByTestId("quick-pdf-completion-error")).toContainText(/no longer matches/i);

    state.hashMismatch = false;
    state.ownerOrgId = PHASE4C2_OTHER_ORG;
    await page.getByTestId("quick-pdf-parties-save").click();
    await expect(page.getByTestId("quick-pdf-completion-error")).toContainText(/workspace/i);
    await expect(page.locator("body")).not.toContainText("document_org_mismatch");

    const recip = createPhase4c2State({ prepared: true, envelopeCreated: true, fieldsSaved: true, revokeToken: true });
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await installPhase4c2ApiMocks(other, recip);
    await other.goto(phase4c2RecipientHref(PHASE4C2_REVOKED), { waitUntil: "domcontentloaded" });
    await expect(other.getByTestId("esign-unavailable")).toBeVisible();
    await expect(other.getByTestId("esign-assigned-field")).toHaveCount(0);
    await expect(other.locator("body")).not.toContainText(PHASE4C2_OWNER.email);
    await expect(other.locator("body")).not.toContainText(PHASE4C2_RECIPIENT.email);
    await ctx.close();
  });

  test("wrong document and missing token stay unavailable without paper", async ({ page }) => {
    const state = createPhase4c2State({ prepared: true, envelopeCreated: true, fieldsSaved: true });
    await installPhase4c2ApiMocks(page, state);
    await page.goto(`/app/esign/${PHASE4C2_DOCUMENT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-unavailable")).toBeVisible();
    await expect(page.getByTestId("esign-recipient-shell")).toHaveCount(0);

    await page.goto(`/app/esign/doc_wrong?vs01_recipient_sign=1&document_id=doc_wrong&agreement_id=${encodeURIComponent("ag-x")}&recipient_index=0&t=${PHASE4C2_TOKEN}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("esign-unavailable").or(page.getByTestId("esign-recipient-shell"))).toBeVisible();
    await expect(page.getByTestId("esign-assigned-field")).toHaveCount(0);
  });
});
