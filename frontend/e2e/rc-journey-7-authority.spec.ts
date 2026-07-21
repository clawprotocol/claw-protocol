/**
 * RC Journey 7 Authority Certification — production API contracts with deterministic service mocks.
 *
 * Status: core ownership path verified; interruption/adversarial cases + full signing chain.
 *
 * Run: npx playwright test e2e/rc-journey-7-authority.spec.ts
 */
import { expect, test } from "@playwright/test";
import { SHARED_TWO_PARTY_INTAKE } from "../src/components/agreements/paidProSharedFixtureSystem";
import {
  clearRcApiMocks,
  installRcPaidProApiRoutes,
  seedRcPaidCheckoutReturn,
  type RcDraftRecord,
} from "./helpers/rcPaidProApiMocks";
import {
  assertAuthoritativePaidHashParity,
  assertAuthoritativePaidReviewDocument,
  clickPaidProReviewSignatureTrack,
  waitForPaidProReviewDecisionSurface,
} from "./helpers/rcJourneyHelpers";
import {
  assertNoEntitlementForInvalidCheckout,
  assertNoEntitlementGranted,
  assertOwnershipMigrationInvariants,
  assertOwnershipUnchanged,
  createOwnershipAuthorityHarness,
  enterPaidReviewAfterMigration,
  formatOwnershipTimeline,
  installOwnershipMigrationAuthorityRoutes,
  readOwnershipCaseEvidence,
  runConcurrentAuthAndCheckout,
  runProductionAuthCallback,
  seedAnonymousAgreementContext,
  type OwnershipMigrationScenario,
} from "./helpers/rcOwnershipMigrationAuthority";
import { seedE2eAuthSession } from "./helpers/rcE2eAuthBridge";
import {
  advanceAuthorityThroughSignerSetup,
  advanceAuthorityThroughPacketDelivery,
  bootstrapAuthorityOwnerReview,
  completeAllVs01Recipients,
  runAuthorityFullChain,
} from "./helpers/rcAuthorityFullChain";
import { createAuthoritySigningChainState } from "./helpers/rcAuthorityCertificationChain";

const CORE_SCENARIOS: OwnershipMigrationScenario[] = [
  { id: "A", label: "auth before checkout settlement", anonAgreementId: "ag_own_a_anon", ownedAgreementId: "ag_own_a_owned" },
  {
    id: "B",
    label: "checkout settlement before auth",
    anonAgreementId: "ag_own_b_anon",
    ownedAgreementId: "ag_own_b_owned",
    checkoutFirst: true,
  },
  { id: "D", label: "auth callback replay", anonAgreementId: "ag_own_d_anon", ownedAgreementId: "ag_own_d_owned", replayAuth: true },
  { id: "H", label: "invalid checkout session", anonAgreementId: "ag_own_h_anon", ownedAgreementId: "ag_own_h_owned", invalidCheckout: true },
];

const EDGE_SCENARIOS: OwnershipMigrationScenario[] = [
  {
    id: "C",
    label: "auth and checkout concurrent",
    anonAgreementId: "ag_own_c_anon",
    ownedAgreementId: "ag_own_c_owned",
    concurrentAuthCheckout: true,
  },
  {
    id: "E",
    label: "reload after checkout return before verify",
    anonAgreementId: "ag_own_e_anon",
    ownedAgreementId: "ag_own_e_owned",
    reloadPhase: "before_verify",
  },
  {
    id: "F",
    label: "verified settlement with delayed webhook",
    anonAgreementId: "ag_own_f_anon",
    ownedAgreementId: "ag_own_f_owned",
    delayedWebhook: true,
  },
  {
    id: "G",
    label: "abandoned checkout after auth",
    anonAgreementId: "ag_own_g_anon",
    ownedAgreementId: "ag_own_g_owned",
    abandonedCheckout: true,
  },
  {
    id: "I",
    label: "mismatched checkout session",
    anonAgreementId: "ag_own_i_anon",
    ownedAgreementId: "ag_own_i_owned",
    mismatchedCheckout: true,
  },
  {
    id: "J",
    label: "reload after migration before review",
    anonAgreementId: "ag_own_j_anon",
    ownedAgreementId: "ag_own_j_owned",
    reloadAfterMigration: true,
  },
];

async function runOwnershipScenario(
  page: Parameters<typeof installOwnershipMigrationAuthorityRoutes>[0],
  scenario: OwnershipMigrationScenario,
  opts?: { skipPaidReview?: boolean },
): Promise<void> {
  if (scenario.invalidCheckout) {
    const harness = createOwnershipAuthorityHarness(scenario);
    await clearRcApiMocks(page);
    await installOwnershipMigrationAuthorityRoutes(page, harness);
    await page.goto("/app/create?checkout_session_id=invalid_cs", { waitUntil: "domcontentloaded" });
    await assertNoEntitlementForInvalidCheckout(page);
    return;
  }

  if (scenario.mismatchedCheckout) {
    const harness = createOwnershipAuthorityHarness(scenario);
    await clearRcApiMocks(page);
    await seedAnonymousAgreementContext(page, {
      anonAgreementId: scenario.anonAgreementId,
      intakeText: SHARED_TWO_PARTY_INTAKE,
    });
    await installOwnershipMigrationAuthorityRoutes(page, harness);
    await page.goto("/app/create?checkout_session_id=wrong_user_cs&premiumCompletion=1", {
      waitUntil: "domcontentloaded",
    });
    await assertNoEntitlementGranted(page);
    await assertOwnershipUnchanged(page, harness);
    return;
  }

  if (scenario.abandonedCheckout) {
    const harness = createOwnershipAuthorityHarness(scenario);
    await clearRcApiMocks(page);
    await seedE2eAuthSession(page);
    await seedAnonymousAgreementContext(page, {
      anonAgreementId: scenario.anonAgreementId,
      intakeText: SHARED_TWO_PARTY_INTAKE,
    });
    await installOwnershipMigrationAuthorityRoutes(page, harness);
    await runProductionAuthCallback(page, { continuationId: `cont_${scenario.id}` });
    await assertOwnershipMigrationInvariants(page, harness);
    await assertNoEntitlementGranted(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const resume = await page.evaluate(() => sessionStorage.getItem("claw_agreement_create_review_resume_v1"));
    expect(resume).toBe(scenario.ownedAgreementId);
    return;
  }

  if (scenario.concurrentAuthCheckout) {
    const harness = createOwnershipAuthorityHarness(scenario);
    const paidDrafts = new Map<string, RcDraftRecord>();
    await clearRcApiMocks(page);
    await seedE2eAuthSession(page);
    await seedAnonymousAgreementContext(page, {
      anonAgreementId: scenario.anonAgreementId,
      intakeText: SHARED_TWO_PARTY_INTAKE,
    });
    await installOwnershipMigrationAuthorityRoutes(page, harness);
    await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, scenario.ownedAgreementId);
    const { authPage, checkoutPage } = await runConcurrentAuthAndCheckout(page.context(), {
      continuationId: `cont_${scenario.id}`,
      checkoutSessionId: `rc_${scenario.id}_cs`,
    });
    await authPage.waitForURL(/\/app\/(create|dashboard)/, { timeout: 90_000 });
    await checkoutPage.close().catch(() => undefined);
    await assertOwnershipMigrationInvariants(authPage, harness);
    if (!opts?.skipPaidReview) {
      await installRcPaidProApiRoutes(authPage, paidDrafts, { draftId: scenario.ownedAgreementId, partyCount: 2 });
      await installOwnershipMigrationAuthorityRoutes(authPage, harness);
      await enterPaidReviewAfterMigration(
        authPage,
        harness,
        paidDrafts,
        SHARED_TWO_PARTY_INTAKE,
        installRcPaidProApiRoutes,
        seedRcPaidCheckoutReturn,
      );
    }
    return;
  }

  const harness = createOwnershipAuthorityHarness(scenario);
  const paidDrafts = new Map<string, RcDraftRecord>();

  await clearRcApiMocks(page);
  await seedE2eAuthSession(page);
  await seedAnonymousAgreementContext(page, {
    anonAgreementId: scenario.anonAgreementId,
    intakeText: SHARED_TWO_PARTY_INTAKE,
  });
  await installOwnershipMigrationAuthorityRoutes(page, harness);

  if (scenario.checkoutFirst) {
    await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, scenario.ownedAgreementId);
    await page.goto(`/app/create?checkout_session_id=rc_${scenario.id}_cs&premiumCompletion=1`, {
      waitUntil: "domcontentloaded",
    });
  }

  if (scenario.reloadPhase === "before_verify") {
    await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, scenario.ownedAgreementId);
    await page.goto(`/app/create?checkout_session_id=rc_${scenario.id}_cs&premiumCompletion=1`, {
      waitUntil: "commit",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await runProductionAuthCallback(page, { continuationId: `cont_${scenario.id}` });
  } else if (scenario.reloadPhase === "after_verify_before_auth") {
    await seedRcPaidCheckoutReturn(page, SHARED_TWO_PARTY_INTAKE, scenario.ownedAgreementId);
    await page.goto(`/app/create?checkout_session_id=rc_${scenario.id}_cs&premiumCompletion=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
    await runProductionAuthCallback(page, { continuationId: `cont_${scenario.id}` });
  } else {
    await runProductionAuthCallback(page, { continuationId: `cont_${scenario.id}` });
    if (scenario.replayAuth) {
      await runProductionAuthCallback(page, { continuationId: `cont_${scenario.id}` });
    }
  }

  if (scenario.reloadAfterMigration) {
    await assertOwnershipMigrationInvariants(page, harness);
    await page.reload({ waitUntil: "domcontentloaded" });
    const evidence = await readOwnershipCaseEvidence(page, harness);
    expect(evidence.agreementIdAfter).toBe(scenario.ownedAgreementId);
  } else {
    await assertOwnershipMigrationInvariants(page, harness);
  }

  if (opts?.skipPaidReview) return;

  await enterPaidReviewAfterMigration(
    page,
    harness,
    paidDrafts,
    SHARED_TWO_PARTY_INTAKE,
    installRcPaidProApiRoutes,
    seedRcPaidCheckoutReturn,
  );

  if (scenario.delayedWebhook) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Review your Pro agreement/i })).toBeVisible({
      timeout: 180_000,
    });
    expect(harness.webhookDelivered || harness.subscriptionFetchCount >= 2).toBeTruthy();
  }

  const evidence = await readOwnershipCaseEvidence(page, harness);
  expect(evidence.premiumFullDraftPosts).toBeLessThanOrEqual(2);
  if (scenario.id === "A") {
    expect(evidence.finalizeAuthCalls).toBeLessThanOrEqual(2);
  }
  test.info().annotations.push({ type: "ownership-timeline", description: formatOwnershipTimeline(harness) });
  test.info().annotations.push({ type: "ownership-evidence", description: JSON.stringify(evidence) });
}

test.describe("RC Journey 7 Authority — core ownership callback order", () => {
  for (const scenario of CORE_SCENARIOS) {
    test(`case ${scenario.id}: ${scenario.label}`, async ({ page }) => {
      test.setTimeout(300_000);
      await runOwnershipScenario(page, scenario);
    });
  }
});

test.describe("RC Journey 7 Authority — ownership interruption and adversarial cases", () => {
  for (const scenario of EDGE_SCENARIOS) {
    test(`case ${scenario.id}: ${scenario.label}`, async ({ page }) => {
      test.setTimeout(300_000);
      await runOwnershipScenario(page, scenario, { skipPaidReview: scenario.id === "G" || scenario.id === "I" });
    });
  }
});

test.describe("RC Journey 7 Authority — signing entry (real review path)", () => {
  test("review → sign prep without seeded completion", async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    try {
      await bootstrapAuthorityOwnerReview(page);
      await advanceAuthorityThroughSignerSetup(page);
    } finally {
      await context.close();
    }
  });
});

test.describe("RC Journey 7 Authority — VS01 single recipient certification", () => {
  for (const run of [1, 2, 3]) {
    test(`one recipient completes VS01 signing (run ${run}/3)`, async ({ browser }) => {
      test.setTimeout(600_000);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      const page = await context.newPage();
      const chainState = createAuthoritySigningChainState();
      try {
        await bootstrapAuthorityOwnerReview(page);
        await advanceAuthorityThroughSignerSetup(page);
        await advanceAuthorityThroughPacketDelivery(page, chainState);
        await completeAllVs01Recipients(page, chainState, { limit: 1 });
        expect(chainState.completions.length).toBe(1);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("RC Journey 7 Authority — full chain packet → delivery → sign → artifact → /verify/:id", () => {
  test("production orchestration with service-boundary mocks", async ({ browser }) => {
    test.setTimeout(900_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const chainState = createAuthoritySigningChainState();
    try {
      await bootstrapAuthorityOwnerReview(page);
      await advanceAuthorityThroughSignerSetup(page);
      await runAuthorityFullChain(page, browser, chainState);
    } finally {
      await context.close();
    }
  });
});
