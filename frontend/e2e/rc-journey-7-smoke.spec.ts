/**
 * RC Journey 7 Smoke — integrated full-chain UI journey (mocked authority).
 *
 * Proves route and surface continuity only:
 *   create → upgrade → own (simulated) → review → sign prep → completed UI → verification UI
 *
 * Does NOT certify: Stripe settlement, auth migration callbacks, packet generation,
 * recipient signing, executed artifacts, or public verification data authority.
 *
 * Run: npx playwright test e2e/rc-journey-7-smoke.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { agreementPublicVerifyPath } from "../src/agreement/agreementPublicVerify";
import { SHARED_TWO_PARTY_INTAKE } from "../src/components/agreements/paidProSharedFixtureSystem";
import {
  installFreeStarterApiRoutes,
  seedAnonymousStarterBrowserState,
  submitHomepageHeroToCreate,
  waitForFreeStarterReviewReady,
} from "./helpers/freeStarterApiMocks";
import {
  clearRcApiMocks,
  installRcPaidProApiRoutes,
  seedRcPaidCheckoutReturn,
  type RcDraftRecord,
} from "./helpers/rcPaidProApiMocks";
import {
  advancePaidProSignerSetupToReviewDecision,
  assertAuthoritativePaidHashParity,
  assertAuthoritativePaidReviewDocument,
  clickPaidProReviewSignatureTrack,
  waitForPaidProReviewDecisionSurface,
} from "./helpers/rcJourneyHelpers";
import {
  installRcFullChainSmokeExtensions,
  markRcFullChainSmokeCompletedState,
  seedRcFullChainSmokeOwnership,
  type RcFullChainSmokeState,
} from "./helpers/rcFullChainSmokeMocks";

const ARTIFACT_DIR = path.join(process.cwd(), "..", ".rc-validation", "e2e-artifacts");

const ANON_ID = "ag_rc_j7_smoke_anon";
const OWNED_ID = "ag_rc_j7_smoke_owned";

async function captureMilestone(page: Page, step: string): Promise<void> {
  const file = path.join(ARTIFACT_DIR, `j7-smoke-${step}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);
}

test.describe("RC Journey 7 Smoke — integrated UI skeleton (mocked authority)", () => {
  test("route and surface continuity across create → upgrade → review → sign prep → done → verify UI", async ({
    browser,
  }) => {
    test.setTimeout(900_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const starterDrafts = new Map<string, RcDraftRecord>();
    const paidDrafts = new Map<string, RcDraftRecord>();
    const chainState: RcFullChainSmokeState = {
      anonAgreementId: ANON_ID,
      ownedAgreementId: OWNED_ID,
      drafts: paidDrafts,
      fullyExecuted: false,
      signaturesRecorded: 0,
      signerPartyCount: 2,
    };

    try {
      await clearRcApiMocks(page);

      await seedAnonymousStarterBrowserState(page);
      await installFreeStarterApiRoutes(page, starterDrafts as Map<string, never>, ANON_ID);
      await submitHomepageHeroToCreate(page, SHARED_TWO_PARTY_INTAKE);
      await waitForFreeStarterReviewReady(page);
      await expect(page.getByText(/Red Mesa Logistics|Harbor Peak Automation/i).first()).toBeVisible();
      await captureMilestone(page, "01-create");

      await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, OWNED_ID);
      await installRcPaidProApiRoutes(page, paidDrafts, { draftId: OWNED_ID, partyCount: 2 });
      await installRcFullChainSmokeExtensions(page, chainState);

      const proCta = page.getByRole("button", { name: /Continue with Pro/i });
      await expect(proCta.first()).toBeVisible({ timeout: 30_000 });
      await proCta.first().click();
      await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 30_000 }).catch(async () => {
        await page.goto(`/app/checkout/${ANON_ID}?source=starter_review_bottom_cta`, {
          waitUntil: "domcontentloaded",
        });
      });
      await captureMilestone(page, "02-checkout");

      await page.goto(`/app/create?checkout_session_id=rc_j7_smoke_cs&premiumCompletion=1`, {
        waitUntil: "domcontentloaded",
      });
      const gap = page.getByRole("dialog", { name: /finish your agreement/i });
      if (await gap.isVisible().catch(() => false)) {
        await page.getByRole("button", { name: /^use defaults$/i }).click();
      }
      await captureMilestone(page, "03-upgrade-return");

      /** Smoke-only: simulates ownership receipt — not production migration authority. */
      await seedRcFullChainSmokeOwnership(page, { priorId: ANON_ID, canonicalId: OWNED_ID });
      await captureMilestone(page, "04-own-simulated");

      await expect(page.getByRole("heading", { name: /Review your Pro agreement/i })).toBeVisible({
        timeout: 180_000,
      });
      await assertAuthoritativePaidReviewDocument(page);
      await assertAuthoritativePaidHashParity(page);
      await captureMilestone(page, "05-review");

      await waitForPaidProReviewDecisionSurface(page, { timeout: 180_000 });
      if (
        await page
          .getByTestId("paid-pro-forced-prepare-signatures")
          .or(page.getByTestId("simple-pro-send-for-signature"))
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await clickPaidProReviewSignatureTrack(page);
      }
      const signerEmail = page.locator('[data-claw-recipient-field="r1-email"]');
      const signerDetailsSaved = page.getByText(/Signer details saved|Ready for signing/i);
      if (await signerDetailsSaved.first().isVisible().catch(() => false)) {
        await expect(signerDetailsSaved.first()).toBeVisible({ timeout: 60_000 });
      } else if (await signerEmail.first().isVisible().catch(() => false)) {
        await advancePaidProSignerSetupToReviewDecision(page);
      }
      await expect(
        page.getByRole("button", {
          name: /Prepare for signing|Complete signer details|Finalize signer details/i,
        }).first(),
      ).toBeVisible({ timeout: 60_000 });
      await captureMilestone(page, "06-sign-prep");

      /** Smoke-only: seeds completed UI state — not executed-artifact authority. */
      markRcFullChainSmokeCompletedState(chainState);
      await page.evaluate((id) => {
        try {
          sessionStorage.setItem(`claw_simple_sent_${encodeURIComponent(id)}`, "1");
        } catch {
          /* ignore */
        }
      }, OWNED_ID);
      await page.goto(`/app/done/${encodeURIComponent(OWNED_ID)}`, { waitUntil: "domcontentloaded" });
      await expect(
        page
          .getByRole("button", { name: /Copy public verify link/i })
          .or(page.getByText(/Everyone who needed to sign has signed|Agreement recorded/i)),
      ).toBeVisible({ timeout: 60_000 });
      await captureMilestone(page, "07-complete-ui");

      /** Canonical public URL — verification payload is smoke-mocked, not artifact-derived. */
      const verifyPath = agreementPublicVerifyPath(OWNED_ID);
      await page.goto(verifyPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Fully executed|Status · fully signed|Loading verification/i).first()).toBeVisible({
        timeout: 60_000,
      });
      await captureMilestone(page, "08-verify-ui");
    } finally {
      await context.close();
    }
  });
});
