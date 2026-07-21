/** @vitest-environment jsdom */
/**
 * TEST549 — anonymous free starter review must not show obsolete ProConversionComparisonCard.
 *
 * Live staging (post-TEST547): shell correctly resolves free_starter and document renders, but
 * shouldShowCreateFlowStarterProRefineUpsell forced ProConversionComparisonCard below the draft
 * while hideStickyForStarterProContinuation suppressed the unified checkout CTA.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedAccessToken, setCachedAccessToken } from "../auth/authAccessTokenCache";
import { writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import {
  clearAuthenticatedWorkspaceSession,
  markAuthenticatedWorkspaceSession,
} from "./completedAgreementViewContext";
import { setOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasPaidDashboardCreateContextActive,
} from "./paidDashboardCreateContext";
import { parseLawdogQaPaymentBypassEnabled } from "./devPaymentBypass";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowReviewShellTransitionReason,
  shouldShowCreateFlowStarterProRefineUpsell,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "../components/agreements/freeStreamlineDraftReview";
import { hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { CreateUiStage } from "../components/agreements/createUiStage";
import { markCurrentSessionFreeStarterIntent } from "../components/agreements/paidProSessionEligibility";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";
import {
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CARD_HEADING,
} from "./simpleProduct/proConversionCopy";
import { PRO_CAN_TIGHTEN_HEADING } from "./simpleProduct/proTransformationCopy";
import { logStarterUpgradeTransition } from "./simpleProduct/starterUpgradeTransition";

const intakeSrc = readFileSync(
  join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);

const streamlineBase = {
  simpleProductFlow: true,
  liveWorkspaceTwoPane: true,
  createProductionTwoPane: true,
  createUiStage: CreateUiStage.DRAFT,
  createFlowPhase: "draft_ready_for_review" as const,
  hasDraft: true,
  paidProAuthoritative: false,
  premiumPaidDocumentSurface: false,
  premiumPersistedFlowActive: false,
  premiumSendPathUnlocked: false,
  hasPaidPremiumCompletionSession,
  showUpgradeToFullDraftOnReview: true,
  tier: "free" as const,
  workspaceProEntitled: false,
};

function onAppCreatePath(): void {
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearCachedAccessToken();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
  setOrgId("anon-staging-test549");
  writeCachedSubscriptionEntitlement(null, "anon-staging-test549");
  markCurrentSessionFreeStarterIntent();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearCachedAccessToken();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TEST549 — anonymous starter upgrade surface (no obsolete comparison card)", () => {
  it("Scenario A — anonymous homepage handoff: free_starter shell, no comparison upsell", () => {
    onAppCreatePath();
    window.history.replaceState({ clawHeroFromHome: true, clawHeroAutoGenerate: true }, "", "/app/create");

    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free", workspaceProEntitled: false })).toBe(
      "free_starter",
    );
    expect(resolveCreateFlowReviewShellTransitionReason({ tier: "free", workspaceProEntitled: false })).toBe(
      "free_starter",
    );
    expect(resolveIsFreeStreamlineDraftReview(streamlineBase)).toBe(true);
    expect(hasPaidDashboardCreateContextActive()).toBe(false);

    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free", workspaceProEntitled: false },
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);
  });

  it("Scenario A — structural: free streamline uses bottom checkout, not comparison card below doc", () => {
    expect(intakeSrc).toContain('case "launch_pro_checkout"');
    expect(intakeSrc).toContain("logStarterUpgradeTransition");
    expect(intakeSrc).toContain("starter_review_bottom_cta");
    expect(intakeSrc).toMatch(
      /hideStickyForStarterProContinuation[\s\S]*showStarterProRefineUpsell/,
    );
    expect(intakeSrc).toMatch(
      /showStarterProRefineUpsell\s*\?\s*\([\s\S]*ProConversionComparisonCard/,
    );
    const freeStreamlineBlock = intakeSrc.slice(
      intakeSrc.indexOf("isFreeStreamlineDraftReview &&"),
      intakeSrc.indexOf("isFreeStreamlineDraftReview &&") + 800,
    );
    expect(freeStreamlineBlock).not.toMatch(/ProConversionComparisonCard[\s\S]*isFreeStreamlineDraftReview/);
  });

  it("Scenario A — obsolete comparison copy must not gate anonymous funnel", () => {
    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to move this from draft to deal?");
    expect(PRO_CAN_TIGHTEN_HEADING).toBe("What Pro can tighten");
    expect(PRO_CTA_KEEP_FREE_DRAFT).toBe("Keep free draft");
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free" },
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);
  });

  it("Scenario B — QA payment bypass 0 does not enable bypass", () => {
    expect(parseLawdogQaPaymentBypassEnabled("0")).toBe(false);
    expect(parseLawdogQaPaymentBypassEnabled(undefined)).toBe(false);
  });

  it("Scenario C — signed-in dashboard paid create unchanged", () => {
    onAppCreatePath();
    window.history.replaceState(null, "", "/app/create");
    markAuthenticatedWorkspaceSession();
    setOrgId("user-test-549-dashboard");
    setCachedAccessToken("test-token-549");
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(true);
    expect(result.reason).toBe("direct_entry_bootstrapped");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
  });

  it("starter-upgrade-transition logs checkout boundary once", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logStarterUpgradeTransition({
      source: "starter_review_bottom_cta",
      component: "unified_bottom_cta",
      nextStep: "checkout",
      paymentRequired: true,
      entitlementPresent: false,
      anonymous: true,
      orgId: "anon-staging-test549",
    });
    expect(spy).toHaveBeenCalledWith(
      "[starter-upgrade-transition]",
      expect.objectContaining({
        source: "starter_review_bottom_cta",
        nextStep: "checkout",
        paymentRequired: true,
        entitlementPresent: false,
        anonymous: true,
      }),
    );
    spy.mockRestore();
  });

  it("non-streamline parent may still use comparison card when eligible", () => {
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput: { tier: "free" },
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: false,
        isFreeStarterReviewSurface: false,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: false,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(true);
  });
});
