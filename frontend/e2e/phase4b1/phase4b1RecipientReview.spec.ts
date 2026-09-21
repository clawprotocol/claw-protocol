import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { assertPhase4b1RecipientReviewRoutes } from "../../src/launch/phase4b1RecipientReviewCoverage";
import {
  PHASE4B1_AGREEMENT_B,
  PHASE4B1_FROZEN_BODY,
  PHASE4B1_FROZEN_LENGTH,
  PHASE4B1_FROZEN_SHA,
  PHASE4B1_LOCKED_VERSION,
  PHASE4B1_ORIGINAL_TERM,
  PHASE4B1_OTHER_BODY,
  PHASE4B1_PARTY_0_NAME,
  PHASE4B1_PARTY_1_NAME,
  PHASE4B1_PROPOSED_TERM,
  PHASE4B1_TITLE,
  PHASE4B1_TOKENS,
  createPhase4b1FixtureState,
  legacyReviewHref,
  primaryReviewHref,
  proposedFrozenBody,
  seedPhase4b1UnsignedRecipient,
  type Phase4b1FixtureState,
} from "./phase4b1RecipientReviewFixtures";

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
  await expect(
    page.getByTestId("recipient-public-review-route").getByRole("heading", { name: "Review agreement" }),
  ).toBeVisible();
  await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
  await expect(page.getByTestId("recipient-document-shell")).toContainText("SAAS SUBSCRIPTION AGREEMENT");
  await expect(page.getByTestId("recipient-document-shell")).toContainText(PHASE4B1_ORIGINAL_TERM);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B1_TITLE);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B1_PARTY_0_NAME);
  await expect(page.getByTestId("recipient-summary-card")).toContainText(PHASE4B1_PARTY_1_NAME);
  const meta = page.getByTestId("recipient-review-authority-meta");
  await expect(meta).toBeVisible();
  await expect(meta).toHaveAttribute("data-locked-version-id", PHASE4B1_LOCKED_VERSION);
  await expect(meta).toHaveAttribute("data-corpus-length", String(PHASE4B1_FROZEN_LENGTH));
  await expect(meta).toHaveAttribute("data-corpus-sha256", PHASE4B1_FROZEN_SHA);
  await expect(meta).toContainText(PHASE4B1_LOCKED_VERSION);
  await expect(meta).toContainText(String(PHASE4B1_FROZEN_LENGTH));
  await expect(meta).toContainText(PHASE4B1_FROZEN_SHA);
  await expect(page.getByTestId("recipient-document-shell")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
}

function assertRecipientScopedTraffic(state: Phase4b1FixtureState, token: string) {
  expect(state.ownerOnlyHits, state.ownerOnlyHits.join("\n")).toEqual([]);
  expect(state.recipientReads.length).toBeGreaterThan(0);
  for (const row of state.recipientReads) {
    expect(row.hasAuth, row.url).toBe(false);
    expect(row.token, row.url).toBe(token);
  }
}

async function openValidReview(page: Page, href: string, token: string) {
  const state = createPhase4b1FixtureState();
  const guards = attachGuards(page, Object.values(PHASE4B1_TOKENS));
  await seedPhase4b1UnsignedRecipient(page, state);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
  await assertExactFrozenPaper(page);
  await assertNoOwnerChrome(page);
  await assertTokenHidden(page, token);
  await assertMobileFit(page);
  assertRecipientScopedTraffic(state, token);
  guards.assertClean();
  return { state, guards };
}

test.describe("Phase 4B.1 recipient agreement review", () => {
  test("fails closed if either review entry loses recipient-token classification", () => {
    expect(() => assertPhase4b1RecipientReviewRoutes()).not.toThrow();
  });

  test("primary magic-link token paints the exact frozen agreement without sign-in", async ({ page }) => {
    await openValidReview(page, primaryReviewHref(PHASE4B1_TOKENS.reviewAParty0), PHASE4B1_TOKENS.reviewAParty0);
    await expect(page.getByTestId("recipient-review-approve-draft")).toBeVisible();
    await expect(page.getByTestId("recipient-review-propose-updated-draft")).toBeVisible();
  });

  test("legacy token query paints the same frozen agreement", async ({ page }) => {
    await openValidReview(page, legacyReviewHref(PHASE4B1_TOKENS.reviewAParty0), PHASE4B1_TOKENS.reviewAParty0);
  });

  test("approve submits once, persists after refresh, and is replay-safe", async ({ page }) => {
    const token = PHASE4B1_TOKENS.reviewAParty0;
    const { state } = await openValidReview(page, primaryReviewHref(token), token);
    await page.getByTestId("recipient-review-approve-draft").click();
    await expect(page.getByTestId("recipient-approved-waiting-header")).toBeVisible();
    await expect(page.getByTestId("recipient-approved-waiting-header")).toContainText(/Review submitted|Approved/i);
    await expect(page.getByTestId("recipient-review-approve-draft")).toHaveCount(0);
    expect(state.approveCount.get(`ag-phase4b1-orion:p-orion`)).toBe(1);
    const approved = page.getByTestId("recipient-approved-draft-collapsed");
    await expect(approved).toBeVisible();
    await approved.locator("summary").click();
    await expect(approved).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(approved).toContainText(PHASE4B1_ORIGINAL_TERM);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-approved-waiting-header")).toBeVisible();
    await expect(page.getByTestId("recipient-review-approve-draft")).toHaveCount(0);
    const approvedAgain = page.getByTestId("recipient-approved-draft-collapsed");
    await approvedAgain.locator("summary").click();
    await expect(approvedAgain).toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(approvedAgain).toContainText(PHASE4B1_ORIGINAL_TERM);
    await assertTokenHidden(page, token);
    expect(state.approveCount.get(`ag-phase4b1-orion:p-orion`)).toBe(1);
  });

  test("propose-changes compares against the frozen original and does not mutate it", async ({ page }) => {
    const token = PHASE4B1_TOKENS.reviewAParty0;
    const { state } = await openValidReview(page, primaryReviewHref(token), token);
    await page.getByTestId("recipient-review-propose-updated-draft").click();
    const editor = page.getByTestId("recipient-edit-draft-textarea");
    await expect(editor).toBeVisible();
    await editor.fill(proposedFrozenBody());
    await page.getByTestId("recipient-compare-versions-button").click();
    const beforeAfter = page.getByTestId("recipient-review-proposed-update-before-after");
    await expect(beforeAfter).toBeVisible();
    await expect(beforeAfter).toContainText(PHASE4B1_ORIGINAL_TERM);
    await expect(beforeAfter).toContainText(PHASE4B1_PROPOSED_TERM);
    await page.getByTestId("recipient-open-send-suggested-edits-modal").click();
    await page.getByTestId("recipient-send-suggested-edits-confirm").click();
    await expect(page.getByTestId("recipient-suggested-edits-sent-ack")).toBeVisible();
    await expect(page.getByTestId("recipient-suggested-edits-sent-ack")).toContainText(
      /Revisions do not change the original until accepted/i,
    );
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.proposedText).toContain(PHASE4B1_PROPOSED_TERM);
    await expect(page.getByTestId("recipient-document-shell")).toContainText(PHASE4B1_ORIGINAL_TERM);
    await expect(page.getByTestId("recipient-document-shell")).not.toContainText(PHASE4B1_PROPOSED_TERM);
    await expect(page.getByTestId("recipient-review-authority-meta")).toHaveAttribute(
      "data-corpus-sha256",
      PHASE4B1_FROZEN_SHA,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertExactFrozenPaper(page);
    await expect(page.getByTestId("recipient-document-shell")).not.toContainText(PHASE4B1_PROPOSED_TERM);
  });

  test("missing, malformed, expired, revoked, wrong-agreement, wrong-party, and wrong-mode tokens show no paper", async ({
    page,
  }) => {
    const state = createPhase4b1FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B1_TOKENS));
    await seedPhase4b1UnsignedRecipient(page, state);
    const cases: { name: string; href: string }[] = [
      { name: "missing", href: "/agreements/ag-phase4b1-orion/review" },
      { name: "malformed", href: primaryReviewHref(PHASE4B1_TOKENS.malformed) },
      { name: "expired", href: primaryReviewHref(PHASE4B1_TOKENS.expired) },
      { name: "revoked", href: primaryReviewHref(PHASE4B1_TOKENS.revoked) },
      { name: "wrong-agreement", href: `/agreements/${PHASE4B1_AGREEMENT_B}/review?t=${PHASE4B1_TOKENS.reviewAParty0}` },
      { name: "wrong-party", href: primaryReviewHref(PHASE4B1_TOKENS.wrongParty) },
      { name: "wrong-mode", href: primaryReviewHref(PHASE4B1_TOKENS.signMode) },
    ];
    for (const row of cases) {
      await page.goto(row.href, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("journey-action-banner"), row.name).toBeVisible();
      await expect(page.getByTestId("journey-action-banner"), row.name).toContainText(INVALID_LINK);
      await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
      await expect(page.getByTestId("recipient-review-authority-meta")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
      await expect(page.locator("body")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
      await expect(page.locator("body")).not.toContainText(PHASE4B1_FROZEN_SHA);
      await assertNoOwnerChrome(page);
    }
    void PHASE4B1_FROZEN_BODY;
    void PHASE4B1_OTHER_BODY;
    guards.assertClean();
  });

  test("a token for agreement A cannot read or act on agreement B", async ({ page }) => {
    const state = createPhase4b1FixtureState();
    await seedPhase4b1UnsignedRecipient(page, state);
    await page.goto(`/agreements/${PHASE4B1_AGREEMENT_B}/review?t=${PHASE4B1_TOKENS.reviewAParty0}&role=reviewer`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("journey-action-banner")).toContainText(INVALID_LINK);
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    await expect(page.getByTestId("recipient-review-approve-draft")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("CONTOSO-ONLY-CORPUS-MUST-NOT-LEAK");
    await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    expect(state.approveCount.size).toBe(0);
    expect(state.proposals).toHaveLength(0);
  });

  test("retryable network failure recovers without leaking cached paper", async ({ page }) => {
    const token = PHASE4B1_TOKENS.reviewAParty0;
    const state = createPhase4b1FixtureState();
    const guards = attachGuards(page, Object.values(PHASE4B1_TOKENS));
    state.failGets = true;
    await seedPhase4b1UnsignedRecipient(page, state);
    await page.goto(primaryReviewHref(token), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recipient-review-load-error")).toBeVisible();
    await expect(page.getByTestId("recipient-review-load-retry")).toBeVisible();
    await expect(page.getByTestId("recipient-document-shell")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("SAAS SUBSCRIPTION AGREEMENT");
    await expect(page.locator("body")).not.toContainText(PHASE4B1_FROZEN_SHA);

    state.failGets = false;
    await page.getByTestId("recipient-review-load-retry").click();
    await expect(page.getByTestId("recipient-document-shell")).toBeVisible();
    await assertExactFrozenPaper(page);
    await assertTokenHidden(page, token);
    await assertMobileFit(page);
    guards.assertClean();
  });
});
