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
import { resolveFreeStarterReviewShellActive, resolveReviewShellChrome } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { CreateUiStage } from "./createUiStage";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { persistPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  computeCreateFlowPaidProReviewReady,
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowAuthoritativeReviewPlain,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import { resolveCreateFlowPaidReviewDisplayPlain } from "./paidProCreateFlowReviewHandoff";

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(80)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(12);

function test493Draft(body = ""): ParsedDraftShape {
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

describe("TEST493 — authoritative create-flow review shell", () => {
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

  it("Case 1 — workspace pro + pipeline acceptance selects paid_pro shell with substantive body", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(true);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    persistPremiumCompletionSnapshot({
      premiumDraft: test493Draft(ACCEPTED_PAID_BODY),
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: ACCEPTED_PAID_BODY,
      premiumReadonlyPlainText: ACCEPTED_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
    });

    expect(resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true })).toBe("paid_pro");
    expect(shouldUsePaidProCreateFlowReviewShell({ workspaceProEntitled: true })).toBe(true);

    const chrome = resolveReviewShellChrome({
      workspaceProEntitled: true,
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: false,
      guidedCompletionActive: false,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      createFlowPhase: "draft_ready_for_review",
      draft: test493Draft(ACCEPTED_PAID_BODY),
      premiumRenderSource: "server_full_draft",
    });
    expect(chrome.kind).toBe("paid_pro");
    expect(chrome.blockPaidProShell).toBe(false);
    expect(chrome.title).not.toBe("Review your draft");

    expect(
      resolveFreeStarterReviewShellActive({
        workspaceProEntitled: true,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        draft: test493Draft(ACCEPTED_PAID_BODY),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);

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
      computeCreateFlowPaidProReviewReady({
        workspaceProEntitled: true,
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: false,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);

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
        draft: test493Draft(ACCEPTED_PAID_BODY),
      }).length,
    ).toBeGreaterThan(1600);
  });

  it("Case 2 — true free user keeps free_starter shell", () => {
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(false);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("free_starter");
    expect(
      resolveIsFreeStreamlineDraftReview({
        tier: "free",
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
    const chrome = resolveReviewShellChrome({
      tier: "free",
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: false,
      guidedCompletionActive: false,
    });
    expect(chrome.kind).toBe("free_starter");
    expect(chrome.blockPaidProShell).toBe(true);
  });

  it("pipeline acceptance alone forces paid_pro even without workspace pro cache", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
  });
});
