/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceProEntitlementCache, markWorkspaceProEntitlementResolvedForTests } from "../../agreement/agreementProFunnelGate";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { resolveIntakeCreateReviewPostGenerationContext } from "./agreementPostGenerationPolicy";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import {
  CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER,
  planEnterCanonicalPaidProReviewFlow,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import {
  planReturningPaidCreateSubmitBootstrap,
  resolveReturningPaidCreateEligible,
  RETURNING_PAID_CREATE_BOOTSTRAP_HELPER,
  shouldSuppressIntakeCanonicalPostGeneration,
} from "./returningPaidCreateBootstrap";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_INTAKE,
  TEST501_RECIPIENT_CANDIDATES,
  test501Draft,
} from "./paidProTest501Fixtures";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST502 — returning paid create reuses post-payment Pro journey", () => {
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
    markWorkspaceProEntitlementResolvedForTests(null);
    vi.restoreAllMocks();
  });

  it("1 — intake bootstraps returning paid submit before entitled rewrite", () => {
    expect(intake).toContain(RETURNING_PAID_CREATE_BOOTSTRAP_HELPER);
    expect(intake).toContain("beginReturningPaidProCreateGeneration");
    expect(intake).toContain("planReturningPaidCreateSubmitBootstrap");
    expect(intake).toContain("resolveCreateFlowWorkspaceProEntitled()");
    const parseIdx = intake.indexOf("const runProductionLocalDraftParse = React.useCallback(");
    const parseBlock = intake.slice(parseIdx, parseIdx + 12000);
    expect(parseBlock).toContain("skipFreeStarterCreateSubmit");
    expect(parseBlock).toContain("runEntitledPremiumImprovementRewrite");
    expect(parseBlock).toContain("beginReturningPaidProCreateGeneration");
  });

  it("2 — workspace-pro returning user resolves paid_pro shell, not free_starter", () => {
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true }),
    ).toBe("paid_pro");
    expect(
      shouldUsePaidProCreateFlowReviewShell({ workspaceProEntitled: true }),
    ).toBe(true);
  });

  it("3 — returning paid bootstrap blocks AgreementReadySummaryCard degraded branch", () => {
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(
      shouldSuppressIntakeCanonicalPostGeneration({
        shellInput: { workspaceProEntitled: true, tier: "free" },
      }),
    ).toBe(true);
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: true,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        shellInput: { workspaceProEntitled: true },
      }),
    ).toBeNull();
    expect(intake).toContain("shellInput: authoritativeCreateFlowReviewShellInput");
  });

  it("4 — post-checkout and returning paid share canonical review entry + SimpleProFinalReviewScreen", () => {
    markPaidProPipelineValidationPassed({ text: TEST501_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(TEST501_ACCEPTED_PAID_BODY);
    const draft = test501Draft("", TEST501_ACCEPTED_PAID_BODY);
    const base = {
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    };
    const postCheckout = planEnterCanonicalPaidProReviewFlow({
      ...base,
      source: "post_checkout_apply_success",
      respectAlreadyOpened: false,
    });
    const returning = planEnterCanonicalPaidProReviewFlow({
      ...base,
      source: "returning_paid_create",
      respectAlreadyOpened: false,
    });
    expect(postCheckout.shouldApply).toBe(true);
    expect(returning.shouldApply).toBe(true);
    expect(postCheckout.ui).toEqual(returning.ui);
    expect(intake).toContain(CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER);
    expect(intake).toContain("<SimpleProFinalReviewScreen");
    expect(
      shouldMountSimpleProFinalReviewForCanonicalEntry({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: returning.ui.createFlowPhase,
        guidedCompletionPhase: returning.ui.guidedCompletionPhase,
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);
  });

  it("5 — returning paid submit bootstrap plan matches post-payment processing shape", () => {
    markWorkspaceProEntitlementResolvedForTests(true);
    const plan = planReturningPaidCreateSubmitBootstrap({ workspaceProEntitled: true, tier: "free" });
    expect(plan).toEqual({
      markProIntent: true,
      markProEntitlementSource: "entitled_rewrite",
      premiumPersistedFlowActive: true,
      premiumSendPathUnlocked: true,
      premiumPostCheckoutPhase: "processing",
      createFlowPhase: "generating_draft",
      displayPhase: "generating_draft",
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    expect(resolveReturningPaidCreateEligible({ tier: "free" })).toBe(true);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
    ).toBe("paid_pro");
  });

  it("6 — accepted paid corpus enables canonical entry with signer hydration", () => {
    const draft = test501Draft("", TEST501_ACCEPTED_PAID_BODY);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      respectAlreadyOpened: false,
      corpusPlain: TEST501_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      recipientCandidates: TEST501_RECIPIENT_CANDIDATES,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.corpusPlain.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(plan.signerHandoff?.signerNames[0]).toMatch(/Sarah Mitchell/i);
    expect(plan.signerHandoff?.signerNames[1]).toMatch(/Michael Torres/i);
  });
});
