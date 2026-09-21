import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b3PublicVerifyRoutes } from "../../src/launch/phase4b3PublicVerifyCoverage";
import {
  PHASE4B3_COUNT_ID,
  PHASE4B3_DIGEST_ID,
  PHASE4B3_EXECUTED_ID,
  PHASE4B3_FORGED_ID,
  PHASE4B3_LAW,
  PHASE4B3_LOCKED_ID,
  PHASE4B3_LOCKED_VERSION,
  PHASE4B3_MISSING_ID,
  PHASE4B3_OVERVIEW_HASH,
  PHASE4B3_PARTIAL_ID,
  PHASE4B3_PARTY_0,
  PHASE4B3_PARTY_0_NAME,
  PHASE4B3_PARTY_1,
  PHASE4B3_PARTY_1_NAME,
  PHASE4B3_PENDING_ID,
  PHASE4B3_PRIVATE,
  PHASE4B3_SIGNER_ROLE_0,
  PHASE4B3_SIGNER_ROLE_1,
  PHASE4B3_SNAP_SHA,
  PHASE4B3_TITLE,
  canonicalVerifyHref,
  createPhase4b3FixtureState,
  legacyVerifyHref,
  seedPhase4b3PublicVerify,
  type Phase4b3FixtureState,
} from "./phase4b3PublicVerifyFixtures";

const CONSOLE_NOISE = /Download the React DevTools|favicon|Failed to load resource/i;

function attachGuards(page: Page) {
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
}

async function assertNoPrivateLeak(page: Page) {
  const body = page.locator("body");
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.body);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.purpose);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.payment);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.email);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.address);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.hmac);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.ownerToken);
  await expect(body).not.toContainText(PHASE4B3_PRIVATE.recipientToken);
  await expect(body).not.toContainText("Commercial fee $180,000");
}

function assertPublicTraffic(state: Phase4b3FixtureState) {
  expect(state.ownerOnlyHits, state.ownerOnlyHits.join("\n")).toEqual([]);
  expect(state.pdfHits, state.pdfHits.join("\n")).toEqual([]);
  expect(state.verifyHits.length).toBeGreaterThan(0);
}

async function openPublicVerify(page: Page, href: string) {
  const state = createPhase4b3FixtureState();
  const guards = attachGuards(page);
  await seedPhase4b3PublicVerify(page, state);
  await page.goto(href, { waitUntil: "domcontentloaded" });
  return { state, guards };
}

async function assertSafeMetadata(page: Page) {
  await expect(page.getByTestId("public-verify-shell")).toBeVisible();
  await expect(page.getByTestId("public-verify-title")).toHaveText(PHASE4B3_TITLE);
  await expect(page.getByTestId("public-verify-participants")).toContainText(PHASE4B3_PARTY_0_NAME);
  await expect(page.getByTestId("public-verify-participants")).toContainText(PHASE4B3_PARTY_1_NAME);
  await expect(page.locator("body")).toContainText(PHASE4B3_LAW);
  await expect(page.getByTestId("public-verify-download-pdf")).toHaveCount(0);
  await assertNoPrivateLeak(page);
  await assertNoOwnerChrome(page);
  await assertMobileFit(page);
}

test.describe("Phase 4B.3 public agreement verification", () => {
  test("fails closed if /verify/:id or /app/verify/:id lose public treatment", () => {
    expect(() => assertPhase4b3PublicVerifyRoutes()).not.toThrow();
  });

  test("locked record shows public-safe metadata without sign-in or private paper", async ({ page }) => {
    const { state, guards } = await openPublicVerify(page, canonicalVerifyHref(PHASE4B3_LOCKED_ID));
    await assertSafeMetadata(page);
    await expect(page.getByTestId("public-verify-status")).toHaveText("Locked for signing");
    await expect(page.getByTestId("public-verify-badge")).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("public-verify-signature-status")).toContainText("Not fully executed");
    await expect(page.getByTestId("public-verify-signature-status")).toContainText(PHASE4B3_LOCKED_VERSION);
    await expect(page.locator("body")).toContainText(PHASE4B3_OVERVIEW_HASH);
    assertPublicTraffic(state);
    guards.assertClean();
  });

  test("partially signed record stays accurate and does not show verified or fully executed", async ({ page }) => {
    const { state, guards } = await openPublicVerify(page, canonicalVerifyHref(PHASE4B3_PARTIAL_ID));
    await assertSafeMetadata(page);
    await expect(page.getByTestId("public-verify-status")).toHaveText("Partially signed");
    await expect(page.getByTestId("public-verify-badge")).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("public-verify-signature-status")).toContainText("1 / 2");
    await expect(page.getByTestId("public-verify-signature-status")).not.toContainText("Fully executed");
    await expect(page.getByText("Record complete")).toHaveCount(0);
    await expect(page.getByText("Verified")).toHaveCount(0);
    assertPublicTraffic(state);
    guards.assertClean();
  });

  test("fully executed attested record copies the canonical /verify/:id link and attributes by persisted ids", async ({
    page,
  }) => {
    const { state, guards } = await openPublicVerify(page, canonicalVerifyHref(PHASE4B3_EXECUTED_ID));
    await assertSafeMetadata(page);
    await expect(page.getByTestId("public-verify-status")).toHaveText("Fully executed");
    await expect(page.getByTestId("public-verify-badge")).toHaveAttribute("data-state", "verified");
    await expect(page.getByText("Record complete")).toBeVisible();
    await page.getByText("View proof record details").click();
    await expect(page.getByTestId("public-verify-events")).toContainText(PHASE4B3_PARTY_0);
    await expect(page.getByTestId("public-verify-events")).toContainText(PHASE4B3_SIGNER_ROLE_0);
    await expect(page.getByTestId("public-verify-events")).toContainText(PHASE4B3_PARTY_1);
    await expect(page.getByTestId("public-verify-events")).toContainText(PHASE4B3_SIGNER_ROLE_1);
    const copy = page.getByTestId("public-verify-copy-link");
    await expect(copy).toHaveAttribute("data-canonical-path", `/verify/${PHASE4B3_EXECUTED_ID}`);
    await expect(copy).toBeVisible();
    expect(page.url()).not.toContain("t=");
    expect(page.url()).not.toContain("token=");
    assertPublicTraffic(state);
    guards.assertClean();
  });

  test("legacy /app/verify/:id produces the same safe result as the canonical path", async ({ page }) => {
    const { state, guards } = await openPublicVerify(page, legacyVerifyHref(PHASE4B3_EXECUTED_ID));
    await assertSafeMetadata(page);
    await expect(page.getByTestId("public-verify-status")).toHaveText("Fully executed");
    await expect(page.getByTestId("public-verify-badge")).toHaveAttribute("data-state", "verified");
    await expect(page.getByTestId("public-verify-copy-link")).toHaveAttribute(
      "data-canonical-path",
      `/verify/${PHASE4B3_EXECUTED_ID}`,
    );
    expect(new URL(page.url()).pathname).toBe(`/app/verify/${PHASE4B3_EXECUTED_ID}`);
    assertPublicTraffic(state);
    guards.assertClean();
  });

  test("pending proof shows preparing/pending and never verified", async ({ page }) => {
    const { state, guards } = await openPublicVerify(page, canonicalVerifyHref(PHASE4B3_PENDING_ID));
    await expect(page.getByTestId("public-verify-pending")).toBeVisible();
    await expect(page.getByTestId("public-verify-pending")).toContainText(/preparing/i);
    await expect(page.getByTestId("public-verify-badge")).toHaveAttribute("data-state", "pending");
    await expect(page.getByText("Record complete")).toHaveCount(0);
    await expect(page.getByTestId("public-verify-download-pdf")).toHaveCount(0);
    await assertNoPrivateLeak(page);
    assertPublicTraffic(state);
    guards.assertClean();
  });

  test("missing, forged provenance, digest mismatch, and count mismatch never show verified or a PDF", async ({
    page,
  }) => {
    const { state, guards } = await openPublicVerify(page, canonicalVerifyHref(PHASE4B3_MISSING_ID));
    await expect(page.getByTestId("public-verify-unavailable")).toBeVisible();
    await expect(page.getByTestId("public-verify-unavailable")).toContainText("Verification is unavailable");
    await expect(page.getByTestId("public-verify-unavailable")).not.toContainText(PHASE4B3_MISSING_ID);
    await expect(page.locator("body")).not.toContainText(/does not exist|may not exist|disabled/i);
    await expect(page.getByTestId("public-verify-shell")).toHaveCount(0);
    await assertNoPrivateLeak(page);

    for (const id of [PHASE4B3_FORGED_ID, PHASE4B3_DIGEST_ID, PHASE4B3_COUNT_ID]) {
      await page.goto(canonicalVerifyHref(id), { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-verify-shell")).toBeVisible();
      await expect(page.getByTestId("public-verify-badge")).not.toHaveAttribute("data-state", "verified");
      await expect(page.getByTestId("public-verify-status")).not.toHaveText("Fully executed");
      await expect(page.getByText("Record complete")).toHaveCount(0);
      await expect(page.getByTestId("public-verify-download-pdf")).toHaveCount(0);
      await assertNoPrivateLeak(page);
    }
    expect(state.pdfHits).toEqual([]);
    guards.assertClean();
  });

  test("retryable network failure recovers without leaking another agreement’s proof", async ({ page }) => {
    const state = createPhase4b3FixtureState();
    const guards = attachGuards(page);
    state.failGets = true;
    await seedPhase4b3PublicVerify(page, state);
    await page.goto(canonicalVerifyHref(PHASE4B3_EXECUTED_ID), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("public-verify-retry")).toBeVisible();
    await expect(page.getByTestId("public-verify-load-retry")).toBeVisible();
    await expect(page.getByTestId("public-verify-shell")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(PHASE4B3_SNAP_SHA);
    await expect(page.locator("body")).not.toContainText(PHASE4B3_TITLE);
    expect(state.pdfHits).toEqual([]);

    state.failGets = false;
    await page.getByTestId("public-verify-load-retry").click();
    await expect(page.getByTestId("public-verify-shell")).toBeVisible();
    await expect(page.getByTestId("public-verify-title")).toHaveText(PHASE4B3_TITLE);
    await expect(page.getByTestId("public-verify-status")).toHaveText("Fully executed");
    await assertNoPrivateLeak(page);
    expect(state.verifyHits.every((id) => id === PHASE4B3_EXECUTED_ID)).toBe(true);
    guards.assertClean();
  });
});
