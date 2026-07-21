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
import {
  clearFrozenPremiumSessionBodiesForTests,
} from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  hasPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import {
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCanonicalPaidCreateFlowReviewCorpusLen,
  resolveCreateFlowAuthoritativeReviewPlain,
  shouldBlockLaunchProCheckoutForPaidCreateFlowReview,
  shouldRenderCreateFlowPaidReviewHydratingSkeleton,
  shouldShowCreateFlowStarterProRefineUpsell,
} from "./authoritativeCreateFlowReviewShell";
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Professional Services LLC. ${"Substantive paid clause. ".repeat(80)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(12);

function test496Draft(_starterBody = STARTER_PREVIEW, paidBody = ""): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Professional Services LLC", role: "Service Provider" },
    ],
    purpose: "Workflow automation consulting",
    payment_terms: "$24,000 after implementation",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
  } as ParsedDraftShape & { server_full_document_text?: string };
}

const streamlineBaseInput = {
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
  workspaceProEntitled: false,
};

describe("TEST496 — paid acceptance hard invariant prevents split-brain starter/checkout surfaces", () => {
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

  it("returning paid create — free_starter before pipeline, then paid_pro with no checkout/starter surfaces", () => {
    markCurrentSessionFreeStarterIntent();
    expect(resolveAuthoritativeCreateFlowReviewShell({})).toBe("free_starter");

    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    markWorkspaceProEntitlementResolvedForTests(true);

    const shellInput = { workspaceProEntitled: true };
    expect(resolveAuthoritativeCreateFlowReviewShell(shellInput)).toBe("paid_pro");
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(true);

    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: false,
      }),
    ).toBe(true);

    expect(
      resolveFreeStarterReviewShellActive({
        ...shellInput,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: false,
        draft: test496Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);

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

    const corpusLen = resolveCanonicalPaidCreateFlowReviewCorpusLen({
      draft: test496Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
      agreementDocumentText: STARTER_PREVIEW,
      premiumRenderSource: "server_full_draft",
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(corpusLen).toBeGreaterThan(PAID_PRO_AUTHORITY_MIN_LEN);
    expect(corpusLen).toBeGreaterThan(1600);
  });

  it("split-brain prevention — paid_pro with empty draft fields promotes latched corpus and shows hydrating skeleton", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);

    const shellInput = { workspaceProEntitled: false };
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(true);

    const promotedPlain = resolveCreateFlowAuthoritativeReviewPlain({
      agreementDocumentText: STARTER_PREVIEW,
      draft: test496Draft(),
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(promotedPlain.length).toBeGreaterThan(1600);
    expect(promotedPlain).not.toContain("Starter preview only");

    expect(
      shouldRenderCreateFlowPaidReviewHydratingSkeleton({
        shellInput,
        simpleProFinalReviewShellActive: false,
      }),
    ).toBe(true);

    expect(
      resolveIsFreeStreamlineDraftReview({
        ...streamlineBaseInput,
        workspaceProEntitled: false,
      }),
    ).toBe(false);
  });

  it("free user unchanged — no paid acceptance keeps starter review; upgrade via bottom checkout CTA", () => {
    markCurrentSessionFreeStarterIntent();
    const shellInput = { workspaceProEntitled: false };

    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(false);
    expect(resolveAuthoritativeCreateFlowReviewShell(shellInput)).toBe("free_starter");
    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: false,
      }),
    ).toBe(false);

    expect(
      resolveIsFreeStreamlineDraftReview({
        ...streamlineBaseInput,
      }),
    ).toBe(true);

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
  });

  it("premiumAccepted snapshot alone activates paid invariant without workspace pro cache", () => {
    persistPremiumCompletionSnapshot({
      premiumDraft: test496Draft(ACCEPTED_PAID_BODY),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    const shellInput = { workspaceProEntitled: false };
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(true);
    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: false,
      }),
    ).toBe(true);
  });
});
