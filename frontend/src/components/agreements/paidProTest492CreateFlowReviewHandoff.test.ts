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
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { resolveSkipFreeStarterCreateSubmit } from "./paidProCreateFlowRouting";
import { CreateUiStage } from "./createUiStage";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  resolveCreateFlowPaidReviewDisplayPlain,
  shouldBlockFreeStarterReviewSurfaces,
} from "./paidProCreateFlowReviewHandoff";

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(80)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(12);

function test492Draft(): ParsedDraftShape {
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
    premium_server_full_document_text: "",
  };
}

describe("TEST492 — paid /app/create local_parse then pipeline acceptance", () => {
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

  it("workspace pro entitlement skips free-starter latch when React tier is stale free", () => {
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "free",
        proAgreementEntitled: false,
      }),
    ).toBe(true);
  });

  it("after pipeline acceptance on workspace pro user, Free Starter shell/conversion surfaces block", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(true);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
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
        draft: test492Draft(),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);
  });

  it("resolveCreateFlowPaidReviewDisplayPlain prefers accepted paid corpus over starter preview", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const displayPlain = resolveCreateFlowPaidReviewDisplayPlain({
      winningBody: ACCEPTED_PAID_BODY,
      snapshotPlain: STARTER_PREVIEW,
      pipelineSource: "server_full_draft",
      handoffBody: STARTER_PREVIEW,
      handoffEstablished: false,
    });
    expect(displayPlain.length).toBeGreaterThan(STARTER_PREVIEW.length);
    expect(displayPlain).toContain("Red Mesa Logistics LLC");
  });

  it("free users without pipeline acceptance still receive Free Starter streamline review", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(false);
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
