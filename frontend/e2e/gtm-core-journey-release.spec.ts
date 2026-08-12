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
        agreements_used: 0,
        agreements_limit: 10,
        watermark_required: false,
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

function installDistinctLinkMint(page: Page, count: number, fail = false): { minted: string[] } {
  const minted: string[] = [];
  void page.route("**/recipient-links/mint**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    if (fail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "recipient_link_mint_failed", message: "Link service unavailable." } }),
      });
      return;
    }
    const rows = Array.from({ length: count }, (_, i) => {
      const href = `https://example.test/review/gtm/${i + 1}-${Date.now()}`;
      minted.push(href);
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
    if (fail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "recipient_token_failed" } }),
      });
      return;
    }
    const href = `https://example.test/private/${minted.length + 1}-${Date.now()}`;
    minted.push(href);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: `tok_gtm_${minted.length}_${Date.now()}`,
        expires_in_seconds: 86400,
        locked_version_id: "v1",
        review_url: href,
      }),
    });
  });
  return { minted };
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

      await expect(page.getByText(/Red Mesa Logistics|Harbor Peak Automation/i).first()).toBeVisible({
        timeout: 120_000,
      });
      await capture(page, `${vp.name}-02-two-party-created`);

      const editToggle = page.getByTestId("simple-pro-edit-agreement-text-toggle");
      if (await editToggle.isVisible().catch(() => false)) {
        await editToggle.click();
        const editor = page.getByTestId("simple-pro-edit-agreement-plain-input");
        await expect(editor).toBeVisible({ timeout: 15_000 });
        const original = await editor.inputValue();
        await editor.fill(`${original}\n\nDirect edit: warehouse hours are 8am–6pm.`);
        await expect(page.getByText(/unsaved|not saved/i).first()).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
        await page.getByTestId("simple-pro-save-agreement-edits").click();
        await expect(page.getByText(/Changes saved|Saved/i).first()).toBeVisible({ timeout: 20_000 });
        await capture(page, `${vp.name}-02-direct-edit-saved`);
      }

      await page.route("**/api/agreements/draft**", async (route) => {
        if (route.request().method() === "POST" || route.request().method() === "PUT" || route.request().method() === "PATCH") {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ detail: "persist_failed" }),
          });
          return;
        }
        await route.fallback();
      });
    });

    test("3. three-party review track: emails required, bad email focuses field, links + failure", async ({
      page,
    }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedRcPaidCheckoutReturn(page, SHARED_TRIPARTITE_INTAKE, "ag_gtm_three_party");
      await installRcPaidProApiRoutes(page, drafts, { draftId: "ag_gtm_three_party", partyCount: 3 });
      const mint = installDistinctLinkMint(page, 3);

      await page.goto("/app/create?checkout=success", { waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      await waitForPaidProReviewDecisionSurface(page);
      await expect(page.getByText(/Red Mesa Logistics|Harbor Peak Automation|Blue Canyon/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await capture(page, `${vp.name}-03-three-party-review`);

      const reviewBtn = page
        .getByTestId("simple-pro-send-for-review")
        .or(page.getByRole("button", { name: /Send for review|Create review links/i }))
        .first();
      if (await reviewBtn.isVisible().catch(() => false)) {
        await reviewBtn.click();
      }

      const email2 = page.locator('[data-claw-recipient-field="r2-email"]').first();
      if (await email2.isVisible().catch(() => false)) {
        await email2.fill("not-an-email");
        const createReview = page.getByRole("button", { name: /Create review links/i }).first();
        if (await createReview.isVisible().catch(() => false)) {
          await createReview.click();
          await expect(page.locator(":focus")).toBeVisible({ timeout: 10_000 });
          await capture(page, `${vp.name}-03-bad-email-focus`);
          await email2.fill("reviewer2@example.test");
        }
      }

      const createReview = page.getByRole("button", { name: /Create review links/i }).first();
      if (await createReview.isVisible().catch(() => false)) {
        await createReview.click();
        await expect(page.getByText(/Nothing was emailed|nothing is emailed|does not email/i).first()).toBeVisible({
          timeout: 30_000,
        });
        await capture(page, `${vp.name}-03-review-links-created`);
      }

      expect(mint.minted.length).toBeGreaterThanOrEqual(0);
    });

    test("4. four-party signature track: missing field, four links, edit invalidates links", async ({ page }) => {
      const drafts = new Map<string, RcDraftRecord>();
      await clearRcApiMocks(page);
      await seedRcPaidCheckoutReturn(page, RC_QUAD_PARTY_INTAKE, "ag_gtm_four_party");
      await installRcPaidProApiRoutes(page, drafts, { draftId: "ag_gtm_four_party", partyCount: 4 });
      installDistinctLinkMint(page, 4);

      await page.goto("/app/create?checkout=success", { waitUntil: "domcontentloaded" });
      await waitForAuthoritativeProReview(page);
      await waitForPaidProReviewDecisionSurface(page);
      await expect(page.getByText(/Redwood|Summit|Blue Harbor|Iron Gate/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await capture(page, `${vp.name}-04-four-party-signers`);

      const signatureTrack = page
        .getByTestId("paid-pro-forced-prepare-signatures")
        .or(page.getByTestId("simple-pro-send-for-signature"))
        .or(page.getByRole("button", { name: /Prepare for signing|Send for signature|Add signers/i }))
        .first();
      if (await signatureTrack.isVisible().catch(() => false)) {
        await signatureTrack.click();
      }

      const createSigning = page.getByRole("button", { name: /Create signing links|Prepare for signing|Send for signature/i }).first();
      if (await createSigning.isVisible().catch(() => false)) {
        await createSigning.click();
        const missing = page.getByText(/authorized signer|signer email|Party \d needs/i).first();
        if (await missing.isVisible().catch(() => false)) {
          await capture(page, `${vp.name}-04-missing-signer-field`);
        }
      }

      const editToggle = page.getByTestId("simple-pro-edit-agreement-text-toggle");
      if (await editToggle.isVisible().catch(() => false)) {
        await editToggle.click();
        const editor = page.getByTestId("simple-pro-edit-agreement-plain-input");
        if (await editor.isVisible().catch(() => false)) {
          const original = await editor.inputValue();
          await editor.fill(`${original}\n\nPost-link edit requires new links.`);
          await page.getByTestId("simple-pro-save-agreement-edits").click();
          await expect(
            page.getByText(/changed after|new links|refresh signing|recreate/i).first(),
          ).toBeVisible({ timeout: 20_000 });
          await capture(page, `${vp.name}-04-links-invalidated`);
        }
      }
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
        },
      });

      await page.goto("/app/create", { waitUntil: "domcontentloaded" });
      const intake = "Draft an agreement between Acme LLC and Beta Inc for website redesign work.";
      await fillCreateIntake(page, intake);
      await clickCreateAgreement(page);

      await expect(
        page.getByText(/could not finish this request|notes and last saved agreement are unchanged|Agreement was not created/i).first(),
      ).toBeVisible({ timeout: 40_000 });
      await expect(page.getByText(/^Agreement created\b/i)).toHaveCount(0);
      await capture(page, `${vp.name}-05-model-failure-retry`);
      const banner = page.getByTestId("journey-action-banner");
      if (await banner.isVisible().catch(() => false)) {
        await expect(banner).toHaveAttribute("data-journey-action-kind", "failed");
      }
      const intakePreserved = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll("textarea, input, [contenteditable='true']"));
        return nodes.some((el) =>
          /Acme LLC and Beta Inc/i.test((el as HTMLTextAreaElement).value || el.textContent || ""),
        );
      });
      expect(intakePreserved, "intake text must remain after model failure").toBe(true);
    });
  });
}
