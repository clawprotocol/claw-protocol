import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4c1QuickIntakeContracts } from "../../src/launch/phase4c1QuickIntakeCoverage";
import { QUICK_PDF_HINT_KEY } from "../../src/launch/simpleProduct/quickPdfUpload";
import {
  installPhase4c1ApiMocks,
  PHASE4C1_AUTH_CODE,
  PHASE4C1_COMPLETE_SAAS,
  PHASE4C1_CONTINUATION_ID,
  PHASE4C1_DOCUMENT_ID,
  PHASE4C1_OTHER_ORG,
  PHASE4C1_OWNER,
  PHASE4C1_PDF,
  PHASE4C1_PDF_SHA,
  PHASE4C1_PDF_TYPE,
  PHASE4C1_SPARSE_SAAS,
  QUICK_PDF_RETURN_PATH,
  createPhase4c1State,
  phase4c1CallbackPath,
  seedPhase4c1Owner,
} from "./phase4c1QuickIntakeFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;
const RECOVERED = /There was an error during concurrent rendering but React was able to recover/;
const SECRETS = [PHASE4C1_CONTINUATION_ID, PHASE4C1_AUTH_CODE, PHASE4C1_OTHER_ORG];

function attachGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    const text = String(err);
    if (RECOVERED.test(text)) return;
    pageErrors.push(text);
  });
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() !== "error") return;
    if (CONSOLE_NOISE.test(text) || RECOVERED.test(text)) return;
    consoleErrors.push(text);
  });
  return {
    assertClean() {
      expect(pageErrors, pageErrors.join("\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    },
  };
}

async function assertNoOverflowOrSecrets(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 2;
  });
  expect(overflow, "page overflowed horizontally").toBe(false);
  const href = page.url();
  expect(href).not.toMatch(/continuation_id=/);
  expect(href).not.toMatch(/[?&](t|token|code|agreement_bridge|vs01_recipient_sign)=/);
  const body = await page.locator("body").innerText();
  for (const secret of SECRETS) {
    expect(body).not.toContain(secret);
  }
  expect(body).not.toContain(PHASE4C1_OWNER.orgId);
}

test.describe("Phase 4C.1 Quick intake", () => {
  test("fails closed if Quick intake contracts are lost", () => {
    expect(() => assertPhase4c1QuickIntakeContracts()).not.toThrow();
  });

  test("public choice, speaking fallback or handoff, and safe aliases", async ({ page }) => {
    const state = createPhase4c1State();
    const guards = attachGuards(page);
    await installPhase4c1ApiMocks(page, state);
    await page.goto("/app/quick", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-choice")).toBeVisible();
    await expect(page.getByTestId("quick-intake-draft")).toContainText(/structured clarifying interview/i);
    await expect(page.getByTestId("quick-intake-pdf")).toContainText(/does not review/i);
    await assertNoOverflowOrSecrets(page);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    });
    await page.goto("/app/quick?start=speak", { waitUntil: "domcontentloaded" });
    if (await page.getByTestId("quick-intake-speak-fallback").count()) {
      await expect(page.getByTestId("quick-intake-speak-fallback")).toContainText(/cannot capture your microphone/i);
      await expect(page.getByTestId("quick-intake-typed")).toBeVisible();
    } else {
      await expect(page.getByTestId("quick-intake-speak-ready")).toBeVisible();
      await page.getByTestId("quick-intake-speak-continue").click();
      await expect(page).toHaveURL(/\/app\/create/);
    }

    await page.goto("/app/esign/new?t=secret&agreement_bridge=1&vs01_recipient_sign=1&documentId=doc_x&foo=1&src=csn", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/app\/quick\?start=pdf/);
    expect(page.url()).toContain("src=csn");
    expect(page.url()).not.toMatch(/t=secret|agreement_bridge|vs01_recipient_sign|documentId|foo=/);

    await page.goto("/app/esign?token=leak&start=type", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/app\/quick\?start=pdf/);
    expect(page.url()).not.toContain("token=");
    expect(page.url()).not.toContain("start=type");
    await expect(page.getByTestId("quick-intake-pdf-signin")).toBeVisible();
    guards.assertClean();
  });

  test("typed sparse SaaS enters create clarification; complete intake is not re-asked", async ({ page }) => {
    const state = createPhase4c1State();
    const guards = attachGuards(page);
    await installPhase4c1ApiMocks(page, state);
    await page.goto("/app/quick?start=type", { waitUntil: "domcontentloaded" });
    await page.getByTestId("quick-intake-typed-text").fill(PHASE4C1_SPARSE_SAAS);
    await page.getByTestId("quick-intake-typed-submit").click();
    await expect(page).toHaveURL(/\/app\/create/);
    await expect(page.getByText(PHASE4C1_SPARSE_SAAS).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Who are the two parties|Name the parties|legal names|I can draft this once I know who/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    expect(state.documentPosts).toEqual([]);
    expect(state.signSessionPosts).toBe(0);

    await page.goto("/app/quick?start=type", { waitUntil: "domcontentloaded" });
    await page.getByTestId("quick-intake-typed-text").fill(PHASE4C1_COMPLETE_SAAS);
    await page.getByTestId("quick-intake-typed-submit").click();
    await expect(page).toHaveURL(/\/app\/create/);
    await expect(page.getByText("Orion Harbor LLC").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Northwind Retail Inc").first()).toBeVisible();
    await expect(page.getByText(/Who are the two parties/i)).toHaveCount(0);
    await expect(page.getByTestId("agreement-intake-clarification")).toHaveCount(0);
    expect(state.documentPosts).toEqual([]);
    guards.assertClean();
  });

  test("signed-out PDF requires sign-in; server continuation returns to Quick over forged next", async ({
    browser,
  }) => {
    const state = createPhase4c1State();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const guards = attachGuards(page);
    await installPhase4c1ApiMocks(page, state);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-pdf-signin")).toBeVisible();
    await expect(page.getByTestId("quick-intake-pdf-file")).toHaveCount(0);
    await page.getByTestId("quick-intake-pdf-signin-cta").click();
    await expect(page).toHaveURL(/\/app\/sign-in\?intent=quick_pdf/);
    expect(page.url()).not.toMatch(/next=.*quick/);

    await seedPhase4c1Owner(page);
    await page.goto(phase4c1CallbackPath({ next: "/app/quick?start=pdf&t=secret" }), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/app\/quick\?start=pdf/);
    expect(page.url()).not.toMatch(/continuation_id=|t=secret|code=/);
    expect(state.finalizeHits).toBeGreaterThan(0);
    guards.assertClean();
    await ctx.close();
  });

  test("free user is blocked; paid owner uploads once to matching details", async ({ page }) => {
    const state = createPhase4c1State({ entitlement: "guest" });
    const guards = attachGuards(page);
    await installPhase4c1ApiMocks(page, state);
    await seedPhase4c1Owner(page, { staleTier: "paid" });
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-pdf-upgrade")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("quick-intake-pdf-file")).toHaveCount(0);
    expect(state.documentPosts).toEqual([]);

    state.entitlement = "paid";
    await page.evaluate(() => localStorage.setItem("claw_tier", "free"));
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-pdf-file")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("quick-intake-pdf-file").setInputFiles({
      name: "owner.pdf",
      mimeType: PHASE4C1_PDF_TYPE,
      buffer: PHASE4C1_PDF,
    });
    await expect(page.getByTestId("quick-intake-pdf-details")).toHaveCount(0);
    const save = page.getByTestId("quick-intake-pdf-save");
    await Promise.all([save.click(), save.click()]);
    await expect(page.getByTestId("quick-intake-pdf-details")).toBeVisible();
    await expect(page.getByTestId("quick-intake-pdf-id")).toHaveText(PHASE4C1_DOCUMENT_ID);
    await expect(page.getByTestId("quick-intake-pdf-hash")).toHaveText(PHASE4C1_PDF_SHA);
    await expect(page.getByTestId("quick-intake-pdf-size")).toHaveText(String(PHASE4C1_PDF.length));
    await expect(page.getByTestId("quick-intake-pdf-type")).toHaveText(PHASE4C1_PDF_TYPE);
    expect(state.documentPosts).toHaveLength(1);
    expect(state.documentPosts[0]?.hasAuth).toBe(true);
    expect(state.documentPosts[0]?.orgId).toBe(PHASE4C1_OWNER.orgId);
    expect(state.signSessionPosts).toBe(0);
    await assertNoOverflowOrSecrets(page);
    guards.assertClean();
  });

  test("invalid type, server rejection, network retry, and refresh restore only owned state", async ({ page }) => {
    const state = createPhase4c1State({ uploadStatus: 400, uploadDetail: "document_too_large" });
    const guards = attachGuards(page);
    await installPhase4c1ApiMocks(page, state);
    await seedPhase4c1Owner(page);
    await page.goto("/app/quick?start=pdf", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-pdf-file")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("quick-intake-pdf-file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a pdf"),
    });
    await expect(page.getByTestId("quick-intake-pdf-error")).toContainText(/Only PDF/i);
    expect(state.documentPosts).toEqual([]);

    await page.getByTestId("quick-intake-pdf-file").setInputFiles({
      name: "too-big.pdf",
      mimeType: PHASE4C1_PDF_TYPE,
      buffer: PHASE4C1_PDF,
    });
    await page.getByTestId("quick-intake-pdf-save").click();
    await expect(page.getByTestId("quick-intake-pdf-error")).toContainText(/too large/i);
    await expect(page.getByTestId("quick-intake-pdf-details")).toHaveCount(0);
    expect(page.url()).not.toContain(PHASE4C1_DOCUMENT_ID);

    state.uploadStatus = 401;
    state.uploadDetail = "unauthorized";
    await page.getByTestId("quick-intake-pdf-save").click();
    await expect(page.getByTestId("quick-intake-pdf-error")).toContainText(/Sign in/i);

    state.uploadStatus = 403;
    state.uploadDetail = "document_org_mismatch";
    await page.getByTestId("quick-intake-pdf-save").click();
    await expect(page.getByTestId("quick-intake-pdf-error")).toContainText(/different workspace/i);
    await expect(page.locator("body")).not.toContainText("document_org_mismatch");

    state.uploadStatus = "network";
    await page.getByTestId("quick-intake-pdf-save").click();
    await expect(page.getByTestId("quick-intake-pdf-error")).toContainText(/not saved/i);
    await expect(page.getByTestId("quick-intake-pdf-details")).toHaveCount(0);

    state.uploadStatus = 200;
    await page.getByTestId("quick-intake-pdf-save").click();
    await expect(page.getByTestId("quick-intake-pdf-details")).toBeVisible();

    await page.evaluate((key) => sessionStorage.setItem(key, "doc_stale_local"), QUICK_PDF_HINT_KEY);
    state.getStatus = 403;
    state.ownerOrgId = PHASE4C1_OTHER_ORG;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("quick-intake-pdf-details")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("quick-intake-pdf-file")).toBeVisible();
    guards.assertClean();
  });
});
