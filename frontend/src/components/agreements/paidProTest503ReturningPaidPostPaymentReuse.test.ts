/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceProEntitlementCache, markWorkspaceProEntitlementResolvedForTests } from "../../agreement/agreementProFunnelGate";
import { resolveIntakeCreateReviewPostGenerationContext } from "./agreementPostGenerationPolicy";
import { resolveAuthoritativeCreateFlowReviewShell } from "./authoritativeCreateFlowReviewShell";
import {
  CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER,
  FINALIZE_CANONICAL_PAID_PRO_PIPELINE_SUCCESS_HELPER,
  planCanonicalPaidProSignerHandoff,
  planEnterCanonicalPaidProReviewFlow,
  planFinalizeCanonicalPaidProPipelineSuccess,
  resolveCanonicalPaidProReviewCorpus,
} from "./enterCanonicalPaidProReviewFlow";
import { mapPaidProStickyCtaToPrimaryCta, resolvePaidProStickyCta } from "./paidProStickyCta";
import { resolveGuidedProUxState } from "./guidedDealCompletion/guidedProUxState";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { shouldSuppressIntakeCanonicalPostGeneration } from "./returningPaidCreateBootstrap";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import {
  TEST503_ACCEPTED_PAID_BODY,
  TEST503_INTAKE,
  TEST503_RECIPIENT_CANDIDATES,
  TEST503_STARTER_PREVIEW,
  test503Draft,
} from "./paidProTest503Fixtures";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST503 — returning paid reuses first-time post-payment Pro review entry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(true);
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
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    vi.restoreAllMocks();
  });

  it("1 — first-time post-checkout and returning paid both use planFinalizeCanonicalPaidProPipelineSuccess", () => {
    expect(intake).toContain(FINALIZE_CANONICAL_PAID_PRO_PIPELINE_SUCCESS_HELPER);
    expect(intake).toContain(CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER);
    expect(intake).toContain('source: "post_checkout_apply_success"');
    expect(intake).toContain('source: "returning_paid_create"');
    expect(intake).not.toContain("applyHydrationFromPremiumSnapshot(hydrated)");
    const rewriteIdx = intake.indexOf("const runEntitledPremiumImprovementRewrite = React.useCallback");
    const rewriteBlock = intake.slice(rewriteIdx, rewriteIdx + 16000);
    expect(rewriteBlock).toContain("planFinalizeCanonicalPaidProPipelineSuccess");
    expect(rewriteBlock).toContain("enterCanonicalPaidProReviewFlow");
  });

  it("2 — returning paid does not mount AgreementReadySummaryCard path after acceptance", () => {
    markPaidProPipelineValidationPassed({ text: TEST503_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(TEST503_ACCEPTED_PAID_BODY);
    expect(
      shouldSuppressIntakeCanonicalPostGeneration({
        shellInput: { workspaceProEntitled: true, premiumPersistedFlowActive: true },
        premiumPersistedFlowActive: true,
      }),
    ).toBe(true);
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: true,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumPersistedFlowActive: true,
        shellInput: { workspaceProEntitled: true, premiumPersistedFlowActive: true },
      }),
    ).toBeNull();
    expect(intake).toContain("clearCreateReviewDraftReadyMarker");
  });

  it("3 — shared finalize plan exposes same review/signature CTA model as first-time Pro", () => {
    const draft = test503Draft(TEST503_STARTER_PREVIEW, TEST503_ACCEPTED_PAID_BODY);
    const base = {
      corpusPlain: TEST503_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST503_INTAKE,
      recipientCandidates: TEST503_RECIPIENT_CANDIDATES,
    };
    const postCheckoutFinalize = planFinalizeCanonicalPaidProPipelineSuccess({
      ...base,
      source: "post_checkout_apply_success",
    });
    const returningFinalize = planFinalizeCanonicalPaidProPipelineSuccess({
      ...base,
      source: "returning_paid_create",
      winningBody: TEST503_STARTER_PREVIEW,
      snapshotPlain: TEST503_STARTER_PREVIEW,
      premiumDeliverablePlain: TEST503_ACCEPTED_PAID_BODY,
      agreementDocumentText: TEST503_STARTER_PREVIEW,
      pipelineWinningBody: TEST503_ACCEPTED_PAID_BODY,
    });
    expect(postCheckoutFinalize.canEnterCanonicalReview).toBe(true);
    expect(returningFinalize.canEnterCanonicalReview).toBe(true);
    expect(postCheckoutFinalize.canonicalPlan.ui).toEqual(returningFinalize.canonicalPlan.ui);
    const reviewDecision = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(reviewDecision.phase).toBe("review_decision");
    const signerComplete = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(mapPaidProStickyCtaToPrimaryCta(signerComplete).label.length).toBeGreaterThan(0);
    expect(
      resolveSimpleProFinalReviewActive({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: returningFinalize.canonicalPlan.ui.createFlowPhase,
        guidedCompletionPhase: returningFinalize.canonicalPlan.ui.guidedCompletionPhase,
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);
  });

  it("4 — authorized signer bullets hydrate Sarah Mitchell / Michael Torres", () => {
    const handoff = planCanonicalPaidProSignerHandoff({
      draft: test503Draft("", TEST503_ACCEPTED_PAID_BODY),
      intakeText: TEST503_INTAKE,
      corpusPlain: TEST503_ACCEPTED_PAID_BODY,
      recipientCandidates: TEST503_RECIPIENT_CANDIDATES,
    });
    expect(handoff?.signerNames[0]).toMatch(/Sarah Mitchell/i);
    expect(handoff?.signerTitles[0]).toMatch(/CEO/i);
    expect(handoff?.signerNames[1]).toMatch(/Michael Torres/i);
    expect(handoff?.signerTitles[1]).toMatch(/President/i);
  });

  it("5 — accepted paid corpus wins over starter preview; guided UX not inactive after canonical entry", () => {
    markPaidProPipelineValidationPassed({ text: TEST503_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(TEST503_ACCEPTED_PAID_BODY);
    const resolved = resolveCanonicalPaidProReviewCorpus({
      winningBody: TEST503_STARTER_PREVIEW,
      snapshotPlain: TEST503_STARTER_PREVIEW,
      draft: test503Draft(TEST503_STARTER_PREVIEW, TEST503_ACCEPTED_PAID_BODY),
      agreementDocumentText: TEST503_STARTER_PREVIEW,
      pipelineWinningBody: TEST503_ACCEPTED_PAID_BODY,
      premiumDeliverablePlain: TEST503_STARTER_PREVIEW,
    });
    expect(resolved.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(resolved.length).toBeGreaterThan(TEST503_STARTER_PREVIEW.length * 3);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: false,
      corpusPlain: resolved,
      pipelineSource: "server_full_draft",
      draft: test503Draft("", TEST503_ACCEPTED_PAID_BODY),
      intakeText: TEST503_INTAKE,
      recipientCandidates: TEST503_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(true);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({
        workspaceProEntitled: true,
        premiumPersistedFlowActive: true,
      }),
    ).toBe("paid_pro");
    expect(
      resolveGuidedProUxState({
        premiumPaidDocumentSurface: true,
        hasGuidedSession: false,
        paidProAcceptedCorpusReady: true,
        suppressPaidProGuidedCompletion: true,
        guidedCompletionPhase: plan.ui.guidedCompletionPhase,
        createFlowPhase: plan.ui.createFlowPhase,
        premiumRecipientUxActive: false,
        finalReviewExplicitlyOpened: plan.ui.guidedFinalReviewExplicitlyOpened,
        sendIntentSelected: false,
      }),
    ).not.toBe("inactive");
  });
});
