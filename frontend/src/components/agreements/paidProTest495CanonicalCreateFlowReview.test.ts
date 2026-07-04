/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionFreeStarterIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { CreateUiStage } from "./createUiStage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  hasPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import {
  isCanonicalPaidCreateFlowFirstReviewActive,
  isCanonicalPaidCreateFlowReviewSurfaceEligible,
  shouldBlockLaunchProCheckoutForPaidCreateFlowReview,
  shouldShowCreateFlowStarterProRefineUpsell,
} from "./authoritativeCreateFlowReviewShell";
import { mapPaidProStickyCtaToPrimaryCta } from "./paidProStickyCta";

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(80)}`;

function test495Draft(body = ACCEPTED_PAID_BODY): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "Workflow automation consulting",
    payment_terms: "$24,000 after implementation",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: body,
    premium_full_document_text: body,
  };
}

const surfaceInput = {
  productionDraftPrimaryReviewSurface: true,
  createUiStage: CreateUiStage.DRAFT,
  createFlowPhase: "draft_ready_for_review" as const,
  hasDraft: true,
};

describe("TEST495 — canonical paid create-flow review converges post-checkout and returning subscriber paths", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    vi.restoreAllMocks();
  });

  it("Path A — first-time post-checkout uses canonical first-review entry", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    persistPremiumCompletionSnapshot({
      premiumDraft: test495Draft(),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    const shellInput = { premiumCheckoutCompleted: true };
    expect(
      isCanonicalPaidCreateFlowReviewSurfaceEligible({ shellInput, ...surfaceInput }),
    ).toBe(true);
    expect(
      isCanonicalPaidCreateFlowFirstReviewActive({
        shellInput,
        ...surfaceInput,
        draft: test495Draft(),
        premiumCheckoutCompleted: true,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);

    const sticky = {
      phase: "review_decision" as const,
      showStickyBar: true,
      action: "guided_continue" as const,
      label: "Review agreement",
      disabled: false,
      reason: "paid_pro_review_decision_on_card",
    };
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).not.toBe("launch_pro_checkout");
    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: true,
      }),
    ).toBe(true);
  });

  it("Path B — returning paid subscriber converges to the same canonical first-review entry", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(true);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    persistPremiumCompletionSnapshot({
      premiumDraft: test495Draft(),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    const shellInput = { workspaceProEntitled: true };
    const firstReviewActive = isCanonicalPaidCreateFlowFirstReviewActive({
      shellInput,
      ...surfaceInput,
      draft: test495Draft(),
      premiumRenderSource: "server_full_draft",
    });
    expect(firstReviewActive).toBe(true);

    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput,
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: true,
        proAgreementEntitled: true,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: true,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);

    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: firstReviewActive,
      }),
    ).toBe(true);
  });

  it("Path A and Path B both select canonical surface eligibility", () => {
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    persistPremiumCompletionSnapshot({
      premiumDraft: test495Draft(),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    const pathA = isCanonicalPaidCreateFlowReviewSurfaceEligible({
      shellInput: { premiumCheckoutCompleted: true },
      ...surfaceInput,
    });
    markWorkspaceProEntitlementResolvedForTests(true);
    const pathB = isCanonicalPaidCreateFlowReviewSurfaceEligible({
      shellInput: { workspaceProEntitled: true },
      ...surfaceInput,
    });
    expect(pathA).toBe(true);
    expect(pathB).toBe(true);
  });
});
