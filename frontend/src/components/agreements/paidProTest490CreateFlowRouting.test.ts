/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  resolveSkipFreeStarterCreateSubmit,
  shouldAutoPersistReviewAgreementRow,
  resolveFreeStarterReviewShellBlocked,
} from "./paidProCreateFlowRouting";
import {
  clearCurrentSessionProEntitlementMarkers,
  evaluatePaidProSourceOfTruthEstablishment,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { CreateUiStage } from "./createUiStage";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";

const PRO_BODY = SHARED_ACCEPTED_PAID_BODY;

function test490ParsedDraft(premiumBody: string): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "Workflow automation consulting",
    payment_terms: "$24,000 after implementation; $24,000 after final acceptance",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: premiumBody,
  };
}

describe("TEST490 — paid create flow must not route into Free Starter review", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
  });

  it("premium tier skips free-starter latch on create submit", () => {
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "premium",
        proAgreementEntitled: false,
      }),
    ).toBe(true);
  });

  it("free tier without entitlement does not skip free-starter latch", () => {
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "free",
        proAgreementEntitled: false,
      }),
    ).toBe(false);
  });

  it("free-starter session blocks auto POST /agreements/draft bootstrap", () => {
    markCurrentSessionFreeStarterIntent();
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
      }),
    ).toBe(false);
  });

  it("paid create submit still allows early persist when skipping free starter", () => {
    markPaidProPipelineValidationPassed({ text: PRO_BODY, source: "server_full_draft" });
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
        draft: test490ParsedDraft(PRO_BODY),
        agreementDocumentText: PRO_BODY,
        pipelineWinningBody: PRO_BODY,
      }),
    ).toBe(true);
  });

  it("pipeline acceptance clears free-starter latch for SoT establishment gate", () => {
    markCurrentSessionFreeStarterIntent();
    markPaidProPipelineValidationPassed({ text: PRO_BODY, source: "server_full_draft" });
    const decision = evaluatePaidProSourceOfTruthEstablishment({
      pipelineSessionAccepted: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.hasFreeStarterSession).toBe(false);
    expect(decision.reason).toBe("current_session_pro_entitlement");
  });

  it("accepted pipeline blocks Free Starter review shell after generation", () => {
    markCurrentSessionFreeStarterIntent();
    markPaidProPipelineValidationPassed({ text: PRO_BODY, source: "server_full_draft" });
    expect(
      resolveFreeStarterReviewShellBlocked({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        acceptedPipelineBody: PRO_BODY,
        acceptedPipelineSource: "server_full_draft",
      }),
    ).toBe(true);
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        draft: test490ParsedDraft(PRO_BODY),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("free users still receive Free Starter streamline review", () => {
    markCurrentSessionFreeStarterIntent();
    expect(
      resolveIsFreeStreamlineDraftReview({
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
    ).toBe(true);
  });

  it("entitled_rewrite session clears free starter before paid review shell selection", () => {
    markCurrentSessionFreeStarterIntent();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: true,
        premiumPersistedFlowActive: true,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);
  });
});
