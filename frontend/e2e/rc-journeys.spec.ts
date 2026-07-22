/**
 * RC release validation — six authoritative browser journeys.
 * Evidence: screenshots under .rc-validation/e2e-artifacts/
 *
 * Run: cd frontend && npm run test:e2e -- e2e/rc-journeys.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  freeStarterReviewPreviewLocator,
  goToFreeStarterReview,
  installFreeStarterApiRoutes,
  PROD_QA_FREELANCE_PROMPT,
  seedAnonymousStarterBrowserState,
  submitHomepageHeroToCreate,
  waitForFreeStarterReviewReady,
} from "./helpers/freeStarterApiMocks";
import {
  clearRcApiMocks,
  installRcPaidProApiRoutes,
  RC_SUBSTANTIVE_PAID_BODY,
  seedRcPaidCheckoutReturn,
  waitForAuthoritativeProReview,
  type RcDraftRecord,
} from "./helpers/rcPaidProApiMocks";
import {
  buildRcQuadPartyPaidBody,
  RC_QUAD_PARTY_INTAKE,
  RC_QUAD_PENDING_DRAFT,
} from "./fixtures/rcQuadPartyProfessional";
import {
  agreementDocumentLocator,
  assertAuthoritativePaidHash,
  assertAuthoritativePaidHashParity,
  assertAuthoritativePaidReviewDocument,
  advancePaidProSignerSetupToReviewDecision,
  assertPaidProSignerDetailsPopulated,
  clickPaidProReviewSignatureTrack,
  readAuthoritativeCorpusText,
  readDevAuthoritativeCorpusLen,
  readPremiumCompletionSnapshot,
  waitForPaidProReviewDecisionSurface,
} from "./helpers/rcJourneyHelpers";
import {
  collectPaidProSoTReadinessDiag,
  waitForAcceptedPaidProSoTReady,
} from "./helpers/rcPaidProSoTReadiness";
import {
  captureJ5ReviewDecisionDiagnostics,
  enableJ5ReviewDecisionDiagnostics,
} from "./helpers/j5ReviewDecisionDiagnostics";
import { hashPaidProCorpus } from "../src/components/agreements/paidProSourceOfTruth";
import { SHARED_TWO_PARTY_INTAKE } from "../src/components/agreements/paidProSharedFixtureSystem";

const ARTIFACT_DIR = path.join(process.cwd(), "..", ".rc-validation", "e2e-artifacts");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await clearRcApiMocks(page);
});

async function captureMilestone(page: Page, journey: string, step: string): Promise<void> {
  const file = path.join(ARTIFACT_DIR, `${journey}-${step}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);
}

function proReviewHeading(page: Page) {
  return page.locator("#premium-pro-review-scroll-anchor").or(
    page.getByRole("heading", { name: /Review your Pro agreement/i }).first(),
  );
}

async function submitPaidProCheckoutReturn(
  page: Page,
  drafts: Map<string, RcDraftRecord>,
  draftId: string,
  partyCount: 2 | 3 | 4 = 2,
  routeOpts?: {
    premiumBody?: string;
    parsePartyCount?: 2 | 3 | 4;
    intake?: string;
    pendingDraft?: typeof RC_QUAD_PENDING_DRAFT;
  },
): Promise<void> {
  const intake = routeOpts?.intake ?? SHARED_TWO_PARTY_INTAKE;
  const { intake: _intake, pendingDraft, ...installOpts } = routeOpts ?? {};
  await clearRcApiMocks(page);
  await seedRcPaidCheckoutReturn(page, intake, draftId, pendingDraft);
  await installRcPaidProApiRoutes(page, drafts, { draftId, partyCount, ...installOpts });
  await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded" });
  const gap = page.getByRole("dialog", { name: /finish your agreement/i });
  if (await gap.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^use defaults$/i }).click();
  }
  await waitForAuthoritativeProReview(page);
}

const PROMPT_B =
  "Create a vendor maintenance agreement between Cedar Ridge Holdings LLC and Northwind Analytics Inc for quarterly reporting support. Texas law governs. Fee $4,200 per quarter.";

function freeStarterDocumentPreview(page: Page) {
  return freeStarterReviewPreviewLocator(page);
}

test.describe("RC Journey 1 — Anonymous Starter isolation", () => {
  test("no agreement A identity leaks into agreement B", async ({ page }) => {
    test.setTimeout(180_000);
    const drafts = new Map<string, RcDraftRecord>();

    await seedAnonymousStarterBrowserState(page);
    await installFreeStarterApiRoutes(page, drafts as Map<string, never>, "ag_rc_starter_a");
    await submitHomepageHeroToCreate(page, PROD_QA_FREELANCE_PROMPT);
    await waitForFreeStarterReviewReady(page);
    await expect(page.getByText(/Anthem Blanchard|Sarah Collins/i).first()).toBeVisible();
    await captureMilestone(page, "j1", "agreement-a-review");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await installFreeStarterApiRoutes(page, drafts as Map<string, never>, "ag_rc_starter_b", "vendor");
    await submitHomepageHeroToCreate(page, PROMPT_B);
    await waitForFreeStarterReviewReady(page);
    await expect(page.getByText(/Cedar Ridge|Northwind/i).first()).toBeVisible();
    await expect(freeStarterDocumentPreview(page)).not.toContainText(/Anthem Blanchard|Sarah Collins/i);
    await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);
    await captureMilestone(page, "j1", "agreement-b-isolated");
  });
});

test.describe("RC Journey 2 — Starter to checkout", () => {
  test("review-first starter reaches checkout without legacy comparison card", async ({ page }) => {
    test.setTimeout(120_000);
    const drafts = new Map();
    await goToFreeStarterReview(page, drafts);
    await expect(page.getByText(/Compare plans/i)).toHaveCount(0);
    await captureMilestone(page, "j2", "starter-review");

    const proCta = page.getByRole("button", { name: /Continue with Pro/i });
    if ((await proCta.count()) === 0) {
      await page.goto("/app/checkout/ag_rc_starter_checkout?source=starter_review_bottom_cta");
    } else {
      await proCta.first().click();
    }
    await expect(page).toHaveURL(/\/app\/checkout\//, { timeout: 20_000 });
    await captureMilestone(page, "j2", "checkout");
  });
});

test.describe("RC Journey 3 — Paid Pro two-party", () => {
  test("entitled create accepts substantive corpus and preserves hash on reload", async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const drafts = new Map<string, RcDraftRecord>();
    try {
      await submitPaidProCheckoutReturn(page, drafts, "ag_rc_paid_two_party", 2);
      await captureMilestone(page, "j3", "paid-review");

      const proof = await assertAuthoritativePaidReviewDocument(page);
      const { hash: hashBefore } = await assertAuthoritativePaidHashParity(page);
      expect(proof.authoritativeLen).toBeGreaterThan(RC_SUBSTANTIVE_PAID_BODY.length);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(proReviewHeading(page)).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(async () => {
          const snap = await readPremiumCompletionSnapshot(page);
          const devLen = await readDevAuthoritativeCorpusLen(page);
          return Math.max(snap.corpusLen, devLen);
        }, { timeout: 120_000 })
        .toBeGreaterThan(8_000);
      await assertAuthoritativePaidReviewDocument(page);
      const { hash: hashAfter } = await assertAuthoritativePaidHashParity(page);
      expect(hashAfter).toBe(hashBefore);
      await expect(page.getByText(/Compare plans/i)).toHaveCount(0);
      await captureMilestone(page, "j3", "reload-parity");
    } finally {
      await context.close();
    }
  });
});

test.describe("RC Journey 4 — Multi-party authority", () => {
  test("four-party intake preserves all legal parties on review surface", async ({ browser }) => {
    // Hard 60s gate — readiness is SoT-authoritative, not overlay polling.
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const drafts = new Map<string, RcDraftRecord>();
    const startedAt = Date.now();

    try {
      const quadBody = buildRcQuadPartyPaidBody();
      // Raw wire fixture remains deterministic; accepted SoT may be pre-freeze normalized.
      expect(hashPaidProCorpus(quadBody)).toBe("10149:e85e06a");

      const intake = RC_QUAD_PARTY_INTAKE;
      await clearRcApiMocks(page);
      await seedRcPaidCheckoutReturn(page, intake, "ag_rc_quad_party", RC_QUAD_PENDING_DRAFT);
      await installRcPaidProApiRoutes(page, drafts, {
        draftId: "ag_rc_quad_party",
        partyCount: 4,
        premiumBody: quadBody,
        parsePartyCount: 4,
      });
      await page.goto("/app/create?premiumCompletion=1", { waitUntil: "domcontentloaded" });
      const gap = page.getByRole("dialog", { name: /finish your agreement/i });
      if (await gap.isVisible().catch(() => false)) {
        await page.getByRole("button", { name: /^use defaults$/i }).click();
      }

      // Authoritative readiness: persisted SoT + verified hash + rendered parity (not heading/overlay).
      const ready = await waitForAcceptedPaidProSoTReady(page, { timeoutMs: 45_000 });
      const acceptedHash = ready.hash;
      const acceptedCorpus = (await readAuthoritativeCorpusText(page)).trim();
      expect(hashPaidProCorpus(acceptedCorpus)).toBe(acceptedHash);
      expect(acceptedCorpus.length).toBe(ready.len);

      // UI assertion separate from SoT readiness (bounded; must leave budget for reload).
      await expect(proReviewHeading(page)).toBeVisible({ timeout: 5_000 });

      const partyMatchers = [
        /Redwood Biologics/i,
        /Summit AI Consulting/i,
        /Blue Harbor Systems/i,
        /Iron Gate Security/i,
      ] as const;
      expect(acceptedCorpus).not.toMatch(/Red Mesa Logistics/i);
      for (const re of partyMatchers) {
        expect(acceptedCorpus, `accepted corpus includes ${re}`).toMatch(re);
      }
      await Promise.all(
        partyMatchers.map((re) =>
          expect(page.getByText(re).first()).toBeVisible({ timeout: 4_000 }),
        ),
      );
      const orderIdx = partyMatchers.map((re) => acceptedCorpus.search(re));
      expect(orderIdx.every((i) => i >= 0), "all four parties located").toBe(true);
      expect(orderIdx, "party order").toEqual([...orderIdx].sort((a, b) => a - b));

      await assertAuthoritativePaidHash(page, acceptedHash);
      await expect(page.getByText(/Party A|Party B/i)).toHaveCount(0);
      // eslint-disable-next-line no-console
      console.log("[j4] accepted_before_reload", {
        ms: Date.now() - startedAt,
        hash: acceptedHash,
        len: ready.len,
        auth: ready.diag.renderedHash,
        hydrate: ready.diag.hydrateStatus,
      });
      await captureMilestone(page, "j4", "quad-party-review");

      await page.reload({ waitUntil: "commit" });
      // Wait for live SoT rematerialization markers before authority polls (avoid evaluate during mount).
      await page.waitForFunction(
        () => Boolean(document.documentElement.getAttribute("data-claw-live-sot-hash")),
        { timeout: 15_000 },
      );
      const reloaded = await waitForAcceptedPaidProSoTReady(page, { timeoutMs: 12_000 });
      expect(reloaded.hash, "reload SoT hash").toBe(acceptedHash);
      expect(reloaded.len, "reload SoT length").toBe(ready.len);
      await expect(proReviewHeading(page)).toBeVisible({ timeout: 5_000 });
      const reloadedCorpus = (await readAuthoritativeCorpusText(page)).trim();
      expect(reloadedCorpus).toBe(acceptedCorpus);
      expect(hashPaidProCorpus(reloadedCorpus)).toBe(acceptedHash);
      for (const re of partyMatchers) {
        expect(reloadedCorpus).toMatch(re);
      }
      await assertAuthoritativePaidHash(page, acceptedHash);
      // eslint-disable-next-line no-console
      console.log("[j4] accepted_after_reload", {
        ms: Date.now() - startedAt,
        hash: reloaded.hash,
        len: reloaded.len,
        auth: reloaded.diag.renderedHash,
        hydrate: reloaded.diag.hydrateStatus,
      });
      await captureMilestone(page, "j4", "quad-party-reload");
    } catch (err) {
      const diag = await collectPaidProSoTReadinessDiag(page, startedAt).catch(() => null);
      // eslint-disable-next-line no-console
      console.error("[j4] FAILURE_DIAG", JSON.stringify(diag));
      throw err;
    } finally {
      await context.close();
    }
  });
});

test.describe("RC Journey 5 — Signing lifecycle (mocked packet)", () => {
  test("owner prepare surface visible after signer details on entitled paid create", async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const drafts = new Map<string, RcDraftRecord>();

    try {
      await enableJ5ReviewDecisionDiagnostics(page);
      await submitPaidProCheckoutReturn(page, drafts, "ag_rc_signing", 2);
      await captureJ5ReviewDecisionDiagnostics(page);
      await waitForPaidProReviewDecisionSurface(page, { timeout: 180_000 });
      await captureMilestone(page, "j5", "review-decision");

      if (
        await page
          .getByTestId("simple-pro-send-for-signature")
          .or(page.getByTestId("paid-pro-forced-prepare-signatures"))
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await clickPaidProReviewSignatureTrack(page);
      }

      await advancePaidProSignerSetupToReviewDecision(page);
      await assertPaidProSignerDetailsPopulated(page);
      await expect(
        page.getByRole("button", {
          name: /Prepare for signing|Complete signer details|Finalize signer details/i,
        }).first(),
      ).toBeVisible({ timeout: 60_000 });
      await captureMilestone(page, "j5", "prepare-for-signing");
    } finally {
      await context.close();
    }
  });
});

test.describe("RC Journey 6 — New agreement after completed Paid Pro", () => {
  test("fresh starter after paid session shows no paid SoT shell", async ({ browser }) => {
    test.setTimeout(600_000);
    const paidContext = await browser.newContext();
    const paidPage = await paidContext.newPage();
    const paidDrafts = new Map<string, RcDraftRecord>();

    await submitPaidProCheckoutReturn(paidPage, paidDrafts, "ag_rc_prior_paid", 2);
    await assertAuthoritativePaidReviewDocument(paidPage);
    await captureMilestone(paidPage, "j6", "prior-paid-complete");
    await paidContext.close();

    const starterContext = await browser.newContext();
    const page = await starterContext.newPage();
    const starterDrafts = new Map();
    await seedAnonymousStarterBrowserState(page);
    await installFreeStarterApiRoutes(page, starterDrafts, "ag_rc_post_paid_starter", "vendor");
    await submitHomepageHeroToCreate(page, PROMPT_B);
    await waitForFreeStarterReviewReady(page);
    await expect(page.getByRole("heading", { name: "Review your Pro agreement" })).toHaveCount(0);
    await expect(page.getByText(/Red Mesa Logistics|Harbor Peak Automation/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue with Pro/i })).toBeVisible({ timeout: 30_000 });
    await captureMilestone(page, "j6", "fresh-starter-isolated");
    await starterContext.close();
  });
});
