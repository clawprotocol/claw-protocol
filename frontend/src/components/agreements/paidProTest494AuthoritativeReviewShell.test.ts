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
import { persistPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_EDIT_FREE_DRAFT,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_CARD_HEADING,
} from "../../launch/simpleProduct/proConversionCopy";
import {
  readCreateFlowAuthoritativeReviewShellReactiveKey,
  resolveCreateFlowAuthoritativeReviewPlain,
  shouldShowCreateFlowStarterProRefineUpsell,
  shouldSuppressFreeStarterCreateFlowConversionUi,
  shouldUseStarterDocumentPaperSurfaceOnCreateFlow,
} from "./authoritativeCreateFlowReviewShell";
import { resolveCreateFlowPaidReviewDisplayPlain } from "./paidProCreateFlowReviewHandoff";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(80)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(12);

function test494Draft(body = ""): ParsedDraftShape {
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
  };
}

describe("TEST494 — suppress Free Starter conversion UI when paid create-flow shell active", () => {
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

  it("Case 1 — existing paid create with pipeline accepted suppresses conversion surfaces and uses paid corpus", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(true);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    persistPremiumCompletionSnapshot({
      premiumDraft: test494Draft(ACCEPTED_PAID_BODY),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    const shellInput = { workspaceProEntitled: true };
    expect(shouldSuppressFreeStarterCreateFlowConversionUi(shellInput)).toBe(true);
    expect(readCreateFlowAuthoritativeReviewShellReactiveKey()).toContain("wpro");

    expect(
      resolveIsFreeStreamlineDraftReview({
        workspaceProEntitled: true,
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        createProductionTwoPane: true,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        premiumSendPathUnlocked: false,
        hasPaidPremiumCompletionSession,
        showUpgradeToFullDraftOnReview: false,
      }),
    ).toBe(false);

    expect(
      shouldUseStarterDocumentPaperSurfaceOnCreateFlow({
        shellInput,
        isFreeStreamlineDraftReview: true,
        createUiStage: CreateUiStage.DRAFT,
        paidProFirstReviewDisplayActive: false,
        isAuthoritativePaidProReviewActive: false,
      }),
    ).toBe(false);

    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput,
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

    const displayPlain = resolveCreateFlowPaidReviewDisplayPlain({
      winningBody: ACCEPTED_PAID_BODY,
      snapshotPlain: STARTER_PREVIEW,
      pipelineSource: "server_full_draft",
      handoffEstablished: false,
      handoffBody: STARTER_PREVIEW,
    });
    expect(displayPlain.length).toBeGreaterThan(1600);
    expect(
      resolveCreateFlowAuthoritativeReviewPlain({
        agreementDocumentText: STARTER_PREVIEW,
        draft: test494Draft(ACCEPTED_PAID_BODY),
      }).length,
    ).toBeGreaterThan(1600);

    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to move this from draft to deal?");
    expect(PRO_CTA_CONTINUE).toBe("Continue with Pro");
    expect(PRO_CTA_EDIT_FREE_DRAFT).toBe("Edit free draft");
    expect(PRO_CTA_KEEP_FREE_DRAFT).toBe("Keep free draft");
  });

  it("Case 2 — true free user still eligible for starter conversion card", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(false);
    expect(shouldSuppressFreeStarterCreateFlowConversionUi({ tier: "free" })).toBe(false);
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
    ).toBe(true);
  });

  it("reactive key updates when pipeline acceptance hash is recorded", () => {
    const before = readCreateFlowAuthoritativeReviewShellReactiveKey();
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const after = readCreateFlowAuthoritativeReviewShellReactiveKey();
    expect(after).not.toBe(before);
    expect(after.length).toBeGreaterThan(0);
  });
});
