/**
 * GTM core-journey release suite — production routes, controlled API mocks.
 *
 * Proves customer-visible behavior (not source-string inspection):
 *   1. Sparse intake blocks without a model call
 *   2. Two-party create + direct edit save/fail
 *   3. Three-party review track
 *   4. Four-party signature track + link invalidation after edit
 *   5. Model failure never shows false success
 *
 * Run: cd frontend && npm run test:e2e -- e2e/gtm-core-journey-release.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { SHARED_TWO_PARTY_INTAKE, SHARED_TRIPARTITE_INTAKE } from "../src/components/agreements/paidProSharedFixtureSystem";
import { RC_QUAD_PARTY_INTAKE } from "./fixtures/rcQuadPartyProfessional";
import {
  clearRcApiMocks,
  installRcPaidProApiRoutes,
  seedEntitledPaidProBrowserState,
  seedRcPaidCheckoutReturn,
  waitForAuthoritativeProReview,
  type RcDraftRecord,
} from "./helpers/rcPaidProApiMocks";
import {
  waitForPaidProReviewDecisionSurface,
} from "./helpers/rcJourneyHelpers";

const ARTIFACT_DIR = path.join(process.cwd(), "..", ".rc-validation", "gtm-release");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function capture(page: Page, slug: string): Promise<void> {
  const file = path.join(ARTIFACT_DIR, `${slug}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);
}

async function fulfillUsageAndPolicy(page: Page): Promise<void> {
  await page.route("**/v1/workspace/bind-user-org**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        org_id: "user-e2e-user-rc-authority",
        user_id: "e2e-user-rc-authority",
        migrated_agreement_count: 0,
        migrated_agreement_ids: [],
      }),
    });
  });
  await page.route("**/v1/subscriptions/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        subscription: {
          id: "sub_rc_paid_pro",
          org_id: "user-e2e-user-rc-authority",
          plan_code: "pro",
          status: "active",
        },
      }),
    });
  });
  await page.route("**/health**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/agreements/usage**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tier: "paid",
        state: "pro",
        grant_source: "stripe",
        agreements_used: 0,
        agreements_limit: 10,
        agreements_remaining: 10,
        agreement_allowance: 10,
        can_create_persisted_agreement: true,
        can_save_guest_draft: false,
        watermark_required: false,
        commercial: {
          state: "pro",
          entitlement: "paid_pro",
          grant_source: "stripe",
          agreement_allowance: 10,
          agreements_used: 0,
          agreements_remaining: 10,
          period_ends_at: "2026-09-01T00:00:00.000Z",
          can_create_persisted_agreement: true,
          can_save_guest_draft: false,
          create_allowed: true,
          upgrade_required: false,
          reason: null,
        },
      }),
    });
  });
  await page.route("**/api/agreements/access/policy**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recipient_link_token_required: false,
        mint_key_configured: true,
        signing_token_configured: true,
        review_link_mint_enabled: true,
      }),
    });
  });
}

function installDistinctLinkMint(
  page: Page,
  count: number,
  ctl: { fail: boolean; minted: string[] },
): void {
  void page.route("**/recipient-links/mint**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    if (ctl.fail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: { code: "recipient_link_mint_failed", message: "Link service unavailable." },
        }),
      });
      return;
    }
    const rows = Array.from({ length: count }, (_, i) => {
      const href = `https://example.test/review/gtm/${i + 1}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      ctl.minted.push(href);
      return {
        partyId: `p-${i + 1}`,
        displayName: `Party ${i + 1}`,
        email: `party${i + 1}@example.test`,
        reviewHref: href,
      };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rows }),
    });
  });
  void page.route("**/recipient-access-token**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    if (ctl.fail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "recipient_token_failed" } }),
      });
      return;
    }
    const href = `https://example.test/private/${ctl.minted.length + 1}-${Date.now()}`;
    ctl.minted.push(href);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: `tok_gtm_${ctl.minted.length}_${Date.now()}`,
        expires_in_seconds: 86400,
        locked_version_id: "v1",
        review_url: href,
      }),
    });
  });
}

async function openEntitledCreate(page: Page): Promise<void> {
  await seedEntitledPaidProBrowserState(page);
  await page.goto("/app/create", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/create/, { timeout: 20_000 });
}

async function fillCreateIntake(page: Page, text: string): Promise<void> {
  const textbox = page.getByRole("textbox").first();
  await textbox.waitFor({ state: "visible", timeout: 30_000 });
  await textbox.fill(text);
}

async function clickCreateAgreement(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: /create agreement/i }).first();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
}

async function fillRecipientField(page: Page, key: string, value: string): Promise<void> {
  const input = page.locator(`[data-claw-recipient-field="${key}"]`).first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
}

for (const vp of VIEWPORTS) {
  test.describe(`GTM core journey — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test.describe.configure({ timeout: 240_000 });

    test("1. sparse intake names missing facts, focuses remedy, makes no model call", async ({ page }) => {
      const modelHits: string[] = [];
      await fulfillUsageAndPolicy(page);
      await page.route("**/api/**", async (route) => {
        const url = route.request().url();
        if (
          url.includes("/api/agreements/parse") ||
          url.includes("premium-full-draft") ||
          url.includes("premium-refine")
        ) {
          modelHits.push(url);
          await route.fulfill({
            status: 599,
            contentType: "application/json",
            body: JSON.stringify({ detail: "model_must_not_run_on_sparse_intake" }),
          });
          return;
        }
        await route.fallback();
      });

      await openEntitledCreate(page);
      await fillCreateIntake(page, "need an NDA");
      await clickCreateAgreement(page);

      const clarification = page.getByTestId("agreement-intake-clarification");
      await expect(clarification).toBeVisible({ timeout: 20_000 });
      await expect(clarification).toContainText(/two legal names|legal names/i);
      await expect(clarification).not.toContainText(/Not enough information|Complete required fields|Try again/i);
      await capture(page, `${vp.name}-01-sparse-blocked`);

      const remedy = page.getByTestId("journey-action-remedy").or(clarification.getByRole("button").last());
      await expect(remedy.first()).toBeVisible({ timeout: 10_000 });
      await remedy.first().click();
      const party1 = page.getByTestId("intake-party-1-name");
      await expect(party1).toBeVisible({ timeout: 10_000 });
      await expect(party1).toBeEnabled();
      expect(modelHits, "sparse intake must not call parse/draft/refine").toEqual([]);
    });

    test("2. two-party create, direct edit unsaved/saving/saved, failed save keeps text", async ({ page }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedEntitledPaidProBrowserState(page);
      await installRcPaidProApiRoutes(page, drafts, { draftId: "ag_gtm_two_party", partyCount: 2 });

      await page.goto("/app/create", { waitUntil: "domcontentloaded" });
      await fillCreateIntake(page, SHARED_TWO_PARTY_INTAKE);
      await clickCreateAgreement(page);

      await expect(page.getByText(/Red Mesa Logistics LLC/i).first()).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByText(/Harbor Peak Automation LLC/i).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/We cannot reach the LawDog API/i)).toHaveCount(0);
      const createdBanner = page.getByTestId("journey-action-banner");
      await expect(createdBanner).toBeVisible({ timeout: 30_000 });
      await expect(createdBanner).toHaveAttribute("data-journey-action-kind", "succeeded");
      await expect(createdBanner).toContainText(/Agreement created/i);
      await capture(page, `${vp.name}-02-two-party-created`);

      const editToggle = page.getByTestId("simple-pro-edit-agreement-text-toggle");
      await expect(editToggle).toBeVisible({ timeout: 30_000 });
      await editToggle.click();
      const editor = page.getByTestId("simple-pro-edit-agreement-plain-input");
      await expect(editor).toBeVisible({ timeout: 15_000 });
      const original = await editor.inputValue();
      const edited = `${original}\n\nDirect edit: warehouse hours are 8am–6pm.`;
      await editor.fill(edited);
      await expect(page.getByTestId("simple-pro-unsaved")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("simple-pro-unsaved")).toContainText(/Unsaved changes/i);
      await page.getByTestId("simple-pro-save-agreement-edits").click();
      await expect(page.getByText(/Saving changes|Saving…/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("simple-pro-save-ack")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("journey-action-banner")).toContainText(/Changes saved/i);
      await capture(page, `${vp.name}-02-direct-edit-saved`);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      await expect(page.getByText(/warehouse hours are 8am/i).first()).toBeVisible({ timeout: 60_000 });

      await page.route("**/canonical-review-snapshot**", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ detail: { code: "snapshot_persist_failed", message: "Could not lock this revision." } }),
          });
          return;
        }
        await route.fallback();
      });

      const editToggleAfter = page.getByTestId("simple-pro-edit-agreement-text-toggle");
      await expect(editToggleAfter).toBeVisible({ timeout: 30_000 });
      await editToggleAfter.click();
      const editorAfter = page.getByTestId("simple-pro-edit-agreement-plain-input");
      await expect(editorAfter).toBeVisible({ timeout: 15_000 });
      const keep = `${await editorAfter.inputValue()}\n\nFailed-save marker remains in the editor.`;
      await editorAfter.fill(keep);
      await page.getByTestId("simple-pro-save-agreement-edits").click();
      await expect(page.getByTestId("journey-action-banner")).toHaveAttribute("data-journey-action-kind", "failed", {
        timeout: 20_000,
      });
      await expect(page.getByTestId("journey-action-banner")).toContainText(/unsaved text is still in the editor|Save did not complete/i);
      await expect(editorAfter).toHaveValue(/Failed-save marker remains in the editor/);
    });

    test("3. three-party review track: emails required, bad email focuses field, links + failure", async ({
      page,
    }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedRcPaidCheckoutReturn(page, SHARED_TRIPARTITE_INTAKE, "ag_gtm_three_party");
      await installRcPaidProApiRoutes(page, drafts, { draftId: "ag_gtm_three_party", partyCount: 3 });
      const mint = { fail: true, minted: [] as string[] };
      installDistinctLinkMint(page, 3, mint);

      await page.goto("/app/create?checkout=success", { waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      await waitForPaidProReviewDecisionSurface(page);
      await expect(page.getByText(/Red Mesa Logistics/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Harbor Peak Automation/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Blue Canyon/i).first()).toBeVisible({ timeout: 10_000 });
      await capture(page, `${vp.name}-03-three-party-review`);

      const reviewBtn = page.getByTestId("simple-pro-send-for-review").first();
      await expect(reviewBtn).toBeVisible({ timeout: 30_000 });
      await reviewBtn.click();

      await fillRecipientField(page, "r1-email", "reviewer1@example.test");
      await fillRecipientField(page, "r2-email", "not-an-email");
      await fillRecipientField(page, "party-2-email", "reviewer3@example.test");

      const createReview = page.getByRole("button", { name: /Create review links/i }).first();
      await expect(createReview).toBeVisible({ timeout: 20_000 });
      await createReview.click();
      const focused = page.locator(":focus");
      await expect(focused).toBeVisible({ timeout: 10_000 });
      await expect(focused).toHaveAttribute("data-claw-recipient-field", "r2-email");
      await capture(page, `${vp.name}-03-bad-email-focus`);

      await fillRecipientField(page, "r2-email", "reviewer2@example.test");
      await createReview.click();
      await expect(page.getByTestId("journey-action-banner")).toHaveAttribute("data-journey-action-kind", "failed", {
        timeout: 20_000,
      });
      await expect(page.locator('[data-claw-recipient-field="r1-email"]').first()).toHaveValue("reviewer1@example.test");
      await expect(page.locator('[data-claw-recipient-field="r2-email"]').first()).toHaveValue("reviewer2@example.test");
      await expect(page.locator('[data-claw-recipient-field="party-2-email"]').first()).toHaveValue(
        "reviewer3@example.test",
      );

      mint.fail = false;
      await createReview.click();
      await expect.poll(() => new Set(mint.minted).size, { timeout: 30_000 }).toBe(3);
      await expect(page.getByText(/Nothing was emailed|does not email/i).first()).toBeVisible({ timeout: 30_000 });
      const unique = [...new Set(mint.minted)];
      expect(unique.length).toBe(3);
      await capture(page, `${vp.name}-03-review-links-created`);
    });

    test("4. four-party signature track: missing field, four links, edit invalidates links", async ({ page }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedRcPaidCheckoutReturn(page, RC_QUAD_PARTY_INTAKE, "ag_gtm_four_party");
      await installRcPaidProApiRoutes(page, drafts, { draftId: "ag_gtm_four_party", partyCount: 4 });
      const mint = { fail: false, minted: [] as string[] };
      installDistinctLinkMint(page, 4, mint);

      await page.goto("/app/create?checkout=success", { waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      await waitForPaidProReviewDecisionSurface(page);
      await expect(page.getByText(/Redwood/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Summit/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Blue Harbor/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Iron Gate/i).first()).toBeVisible({ timeout: 10_000 });
      await capture(page, `${vp.name}-04-four-party-signers`);

      const signatureTrack = page
        .getByTestId("paid-pro-forced-prepare-signatures")
        .or(page.getByTestId("simple-pro-send-for-signature"))
        .first();
      await expect(signatureTrack).toBeVisible({ timeout: 30_000 });
      await signatureTrack.click();

      await expect(page.locator('[data-claw-recipient-field="r1-signer-name"]').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('[data-claw-recipient-field="r2-signer-name"]').first()).toBeVisible();
      await expect(page.locator('[data-claw-recipient-field="party-2-signer-name"]').first()).toBeVisible();
      await expect(page.locator('[data-claw-recipient-field="party-3-signer-name"]').first()).toBeVisible();

      await fillRecipientField(page, "r1-signer-name", "Redwood Biologics, Inc.");
      await fillRecipientField(page, "r1-email", "ava@example.test");
      const createSigning = page.getByRole("button", {
        name: /Save signer details|Complete signer details|Create signing links|Prepare for signing/i,
      }).first();
      await expect(createSigning).toBeVisible({ timeout: 20_000 });
      await createSigning.click();
      await expect(page.getByText(/authorized signer name/i).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator(":focus")).toHaveAttribute("data-claw-recipient-field", "r1-signer-name");
      await capture(page, `${vp.name}-04-missing-signer-field`);

      await fillRecipientField(page, "r1-name", "Redwood Biologics, Inc.");
      await fillRecipientField(page, "r1-signer-name", "Ava Chen");
      await fillRecipientField(page, "r1-email", "ava@example.test");
      await fillRecipientField(page, "r2-name", "Summit AI Consulting LLC");
      await fillRecipientField(page, "r2-signer-name", "Noah Patel");
      await fillRecipientField(page, "r2-email", "noah@example.test");
      await fillRecipientField(page, "party-2-legal-name", "Blue Harbor Systems LLC");
      await fillRecipientField(page, "party-2-signer-name", "Maya Brooks");
      await fillRecipientField(page, "party-2-email", "maya@example.test");
      await fillRecipientField(page, "party-3-legal-name", "Iron Gate Security LLC");
      await fillRecipientField(page, "party-3-signer-name", "Luis Ortega");
      await fillRecipientField(page, "party-3-email", "luis@example.test");

      const finalizeSignerDetails = page.getByRole("button", {
        name: /Save signer details|Complete signer details|Finalize signer details and continue to review decision|Continue|Create signing links/i,
      }).first();
      await expect(finalizeSignerDetails).toBeVisible({ timeout: 20_000 });
      await finalizeSignerDetails.click();
      await capture(page, `${vp.name}-04-post-finalize-decision`);
      const prepareSigning = page
        .getByTestId("paid-pro-forced-prepare-signatures")
        .or(page.getByTestId("simple-pro-send-for-signature"))
        .first();
      const signingSuccess = page.getByText(/Nothing was emailed|does not email/i).first();
      await expect(prepareSigning.or(signingSuccess).first()).toBeVisible({ timeout: 30_000 });
      if (!(await signingSuccess.isVisible())) {
        await page.evaluate(() => {
          const explicit = document.querySelector<HTMLButtonElement>(
            '[data-testid="paid-pro-forced-prepare-signatures"]',
          );
          const legacy = document
            .querySelector<HTMLElement>('[data-testid="simple-pro-send-for-signature"]')
            ?.closest<HTMLButtonElement>("button");
          const button = explicit ?? legacy ?? null;
          if (!button) return false;
          button.click();
          return true;
        });
      }
      await expect.poll(() => new Set(mint.minted).size, { timeout: 30_000 }).toBe(4);
      await expect(signingSuccess).toBeVisible({ timeout: 30_000 });
      expect([...new Set(mint.minted)].length).toBe(4);

      await page.goto("/app/create?checkout=success", { waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      const editToggle = page.getByTestId("simple-pro-edit-agreement-text-toggle");
      await expect(editToggle).toBeVisible({ timeout: 20_000 });
      await editToggle.click();
      const editor = page.getByTestId("simple-pro-edit-agreement-plain-input");
      await expect(editor).toBeVisible({ timeout: 15_000 });
      const original = await editor.inputValue();
      await editor.fill(`${original}\n\nPost-link edit requires new links.`);
      await page.getByTestId("simple-pro-save-agreement-edits").click();
      await expect(
        page.getByText(/changed after|no longer valid|new links|refresh signing|recreate/i).first(),
      ).toBeVisible({ timeout: 20_000 });
      await capture(page, `${vp.name}-04-links-invalidated`);
    });

    test("5. model timeout never erases intake or shows false success", async ({ page }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedEntitledPaidProBrowserState(page);
      await installRcPaidProApiRoutes(page, drafts, {
        draftId: "ag_gtm_model_fail",
        partyCount: 2,
        premiumFullDraftFailure: {
          status: 503,
          detail: {
            code: "premium_full_draft_unavailable",
            message: "The Pro draft did not complete. Your notes are still here — retry.",
          },
          failRemaining: { current: 1 },
        },
      });

      await page.goto("/app/create", { waitUntil: "domcontentloaded" });
      const intake = "Draft an agreement between Acme LLC and Beta Inc for website redesign work.";
      await fillCreateIntake(page, intake);
      await clickCreateAgreement(page);

      const banner = page.getByTestId("journey-action-banner");
      await expect(banner).toBeVisible({ timeout: 40_000 });
      await expect(banner).toHaveAttribute("data-journey-action-kind", "failed");
      await expect(banner).toContainText(/couldn't create the agreement/i);
      await expect(banner).toContainText(/Your information is unchanged/i);
      await expect(page.getByText(/^Agreement created\b/i)).toHaveCount(0);
      await expect(page.getByTestId("journey-action-remedy")).toBeVisible();
      await capture(page, `${vp.name}-05-model-failure-retry`);

      const intakeBox = page.getByRole("textbox").first();
      await expect(intakeBox).toBeVisible({ timeout: 15_000 });
      await expect(intakeBox).toHaveValue(/Acme LLC and Beta Inc/);
      await expect(page.getByText(/Review your agreement draft/i)).toHaveCount(0);

      await page.getByTestId("journey-action-remedy").click();
      await expect(page.getByText(/Red Mesa Logistics|Harbor Peak Automation|Acme LLC|Beta Inc/i).first()).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByTestId("journey-action-banner")).toHaveAttribute("data-journey-action-kind", "succeeded", {
        timeout: 30_000,
      });
    });
  });
}
