import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4c23RecipientCompletionTruthContracts } from "../../src/launch/phase4c23RecipientCompletionTruthCoverage";
import { OWNER_ROLE_ID, RECIPIENT_ROLE_ID } from "../../src/launch/simpleProduct/quickPdfEnvelope";
import {
  PHASE4C2_RECIPIENT,
  PHASE4C2_RECIPIENT_PARTY_ID,
  PHASE4C2_TOKEN,
  createPhase4c2State,
  installPhase4c2ApiMocks,
  phase4c2RecipientHref,
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

async function openRecipient(page: Page, state = createPhase4c2State({ envelopeCreated: true, fieldsSaved: true, prepared: true })) {
  state.signedRoles.add(OWNER_ROLE_ID);
  const guards = attachGuards(page, [PHASE4C2_TOKEN, PHASE4C2_RECIPIENT.email]);
  await installPhase4c2ApiMocks(page, state);
  await page.goto(phase4c2RecipientHref(), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("esign-recipient-shell")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("esign-assigned-field").locator("input").first()).toBeVisible();
  return { state, guards };
}

async function fillAndConsent(page: Page) {
  await page.getByTestId("esign-assigned-field").locator("input").first().fill(PHASE4C2_RECIPIENT.name);
  await expect(page.getByTestId("esign-finish-signing")).toHaveText(/Agree and sign/);
  await expect(page.getByTestId("esign-finish-signing")).toBeDisabled();
  await page.getByTestId("esign-recipient-consent").check();
  await expect(page.getByTestId("esign-finish-signing")).toBeEnabled();
}

test.describe("Phase 4C.2.3 recipient completion truth", () => {
  test("fails closed if shared recipient-completion truth contracts are lost", () => {
    expect(() => assertPhase4c23RecipientCompletionTruthContracts()).not.toThrow();
  });

  test("rejected or unreachable completion never shows success or local signed state", async ({ page }) => {
    const { state, guards } = await openRecipient(page);
    state.completeFailOnce = "403";
    await fillAndConsent(page);
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toHaveCount(0);
    await expect(page.getByText(/new link/i)).toBeVisible();
    await expect(page.getByTestId("esign-assigned-field").locator("input").first()).toHaveValue(PHASE4C2_RECIPIENT.name);
    expect(state.completeHits).toHaveLength(0);
    expect(state.signedRoles.has(RECIPIENT_ROLE_ID)).toBe(false);

    state.completeFailOnce = "network";
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toHaveCount(0);
    await expect(page.getByText(/try Agree and sign again/i)).toBeVisible();
    expect(state.signedRoles.has(RECIPIENT_ROLE_ID)).toBe(false);
    guards.assertClean();
  });

  test("retry after 503 produces one completion and refresh restores server-confirmed success", async ({ page }) => {
    const { state, guards } = await openRecipient(page);
    state.completeFailOnce = "503";
    await fillAndConsent(page);
    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toHaveCount(0);
    await expect(page.getByText(/try Agree and sign again/i)).toBeVisible();
    expect(state.completeHits).toHaveLength(0);

    await page.getByTestId("esign-finish-signing").click();
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    await expect(page.getByText(/You're all set/i)).toBeVisible();
    expect(state.completeHits).toHaveLength(1);
    expect(state.completeHits[0]?.participantId).toBe(PHASE4C2_RECIPIENT_PARTY_ID);
    expect(state.completeBodies[0]).toMatchObject({
      signer_role_id: RECIPIENT_ROLE_ID,
      consent: { accepted: true, action: "agree_and_sign" },
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("esign-recipient-complete")).toBeVisible();
    await expect(page.getByTestId("esign-finish-signing")).toHaveCount(0);
    expect(state.completeHits).toHaveLength(1);
    guards.assertClean();
  });
});
