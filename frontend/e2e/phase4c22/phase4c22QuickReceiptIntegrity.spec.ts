import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4c22QuickReceiptIntegrityContracts } from "../../src/launch/phase4c22QuickReceiptIntegrityCoverage";
import { QUICK_PDF_HINT_KEY } from "../../src/launch/simpleProduct/quickPdfUpload";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  PHASE4C2_AGREEMENT_ID,
  PHASE4C2_OWNER,
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
  await seedPhase4c2Owner(page);
  await page.addInitScript(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    {
      key: QUICK_PDF_HINT_KEY,
      value: JSON.stringify({
        documentId: "doc_phase4c2_pdf",
        contentSha256: "hint",
        sizeBytes: 1,
        contentType: "application/pdf",
      }),
    },
  );
}

test.describe("Phase 4C.2.2 Quick receipt integrity", () => {
  test("fails closed if uploaded-PDF receipt integrity contracts are lost", () => {
    expect(() => assertPhase4c22QuickReceiptIntegrityContracts()).not.toThrow();
  });

  test("incomplete signer set has no receipt and GET does not issue one", async ({ page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-fully-executed")).toHaveCount(0);
    const writes = state.envelopeWrites;
    await page.getByTestId("quick-pdf-goto-receipt").click();
    await expect(page.getByTestId("quick-pdf-pending-receipt")).toBeVisible();
    expect(state.receiptIssued).toBe(false);
    expect(state.envelopeWrites).toBe(writes);
    await expect(page.locator("body")).not.toContainText(PHASE4C2_TOKEN);
  });

  test("recipient completion issues the receipt before owner refresh and later GETs do not write", async ({ browser, page }) => {
    const state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true });
    state.signedRoles.add(OWNER_ROLE_ID);
    await installPhase4c2ApiMocks(page, state);
    await resumeDetails(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-pdf-deliver")).toBeVisible({ timeout: 20_000 });
    expect(state.receiptIssued).toBe(false);

    const recipCtx = await browser.newContext();
    const recip = await recipCtx.newPage();
    const guards = attachGuards(recip, [PHASE4C2_TOKEN, PHASE4C2_REISSUED]);
    await installPhase4c2ApiMocks(recip, state);
    await recip.goto(phase4c2RecipientHref(PHASE4C2_TOKEN), { waitUntil: "domcontentloaded" });
    await expect(recip.getByTestId("esign-recipient-shell")).toBeVisible({ timeout: 20_000 });
    await recip.getByTestId("esign-assigned-field").locator("input").first().fill(PHASE4C2_RECIPIENT.name);
    await recip.getByTestId("esign-finish-signing").click();
    await expect(recip.getByTestId("esign-recipient-complete")).toBeVisible();
    expect(state.completeHits[0]?.signerRoleId).toBe(RECIPIENT_ROLE_ID);
    expect(state.completeHits[0]?.participantId).toBe(PHASE4C2_RECIPIENT_PARTY_ID);
    expect(state.receiptIssued).toBe(true);
    guards.assertClean();
    await recipCtx.close();

    const writesAfterComplete = state.envelopeWrites;
    const receiptGetsBefore = state.receiptGets;
    await page.getByTestId("quick-pdf-goto-receipt").click();
    await expect(page.getByTestId("quick-pdf-fully-executed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("quick-pdf-receipt-id")).toHaveText(`Receipt ${PHASE4C2_RECEIPT_ID}`);
    await expect(page.getByTestId("quick-pdf-receipt-digest")).toHaveText(`Digest ${PHASE4C2_RECEIPT_DIGEST}`);
    await page.getByTestId("quick-pdf-receipt-refresh").click();
    await expect(page.getByTestId("quick-pdf-receipt-digest")).toHaveText(`Digest ${PHASE4C2_RECEIPT_DIGEST}`);
    expect(state.receiptGets).toBeGreaterThan(receiptGetsBefore);
    expect(state.envelopeWrites).toBe(writesAfterComplete);
    await expect(page.locator("body")).not.toContainText(PHASE4C2_TOKEN);
    await expect(page.locator("body")).not.toContainText("LAWDOG_QUICK_PDF_ENVELOPE_V1");
  });
});
