/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { writeCachedSubscriptionEntitlement } from "../../access/subscriptionEntitlementCache";
import { getOrgId } from "../../launch/orgContext";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { resolveSkipFreeStarterCreateSubmit } from "./paidProCreateFlowRouting";
import { CreateUiStage } from "./createUiStage";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { persistPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  hasAcceptedPaidCreateFlowFreezeLatch,
  latchAcceptedPremiumBodyForCreateFlowTest,
  shouldBlockFreeStarterReviewSurfaces,
  tryEstablishAcceptedPremiumCorpusForCreateFlowHandoff,
} from "./paidProCreateFlowReviewHandoff";

const PRO_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive clause. ".repeat(900)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(12);

function test491Draft(premiumBody?: string): ParsedDraftShape {
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
    premium_server_full_document_text: premiumBody ?? "",
  };
}

describe("TEST491 — paid /app/create review handoff after accepted generation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    vi.restoreAllMocks();
  });

  it("accepted freeze latch blocks Free Starter streamline + shell surfaces", () => {
    markCurrentSessionFreeStarterIntent();
    latchAcceptedPremiumBodyForCreateFlowTest(PRO_BODY);
    markPaidProPipelineValidationPassed({ text: PRO_BODY, source: "server_full_draft" });
    expect(hasAcceptedPaidCreateFlowFreezeLatch()).toBe(true);
    expect(shouldBlockFreeStarterReviewSurfaces()).toBe(true);
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
    ).toBe(false);
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: false,
        isFreeStarterReviewSurface: false,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        draft: test491Draft(PRO_BODY),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("tryEstablishAcceptedPremiumCorpusForCreateFlowHandoff uses latched body over starter preview", () => {
    latchAcceptedPremiumBodyForCreateFlowTest(PRO_BODY);
    markPaidProPipelineValidationPassed({ text: PRO_BODY, source: "server_full_draft" });
    const handoff = tryEstablishAcceptedPremiumCorpusForCreateFlowHandoff({
      winningBody: PRO_BODY,
      snapshotPlain: STARTER_PREVIEW,
      pipelineSource: "server_full_draft",
      draft: test491Draft(),
      intakeText: "Red Mesa / Harbor Peak services agreement",
    });
    expect(handoff.established).toBe(true);
    expect(handoff.body.length).toBeGreaterThan(STARTER_PREVIEW.length);
    expect(hasPaidProSourceOfTruth()).toBe(true);
  });

  it("cached pro subscription skips free-starter latch even when access tier is free", () => {
    writeCachedSubscriptionEntitlement(
      { plan_code: "pro", status: "active", org_id: getOrgId() } as never,
      getOrgId(),
    );
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "free",
        proAgreementEntitled: false,
      }),
    ).toBe(true);
  });

  it("pipeline acceptance hash blocks Free Starter while SoT establishment is pending", () => {
    markPaidProPipelineAcceptedCorpusHash(PRO_BODY);
    expect(shouldBlockFreeStarterReviewSurfaces()).toBe(true);
  });

  it("premiumAccepted snapshot blocks Free Starter after entitled rewrite", () => {
    persistPremiumCompletionSnapshot({
      premiumDraft: test491Draft(PRO_BODY),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: PRO_BODY,
      premiumReadonlyPlainText: PRO_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });
    expect(shouldBlockFreeStarterReviewSurfaces()).toBe(true);
  });

  it("free users without subscription still receive Free Starter streamline review", () => {
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    markCurrentSessionFreeStarterIntent();
    expect(shouldBlockFreeStarterReviewSurfaces()).toBe(false);
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
});
