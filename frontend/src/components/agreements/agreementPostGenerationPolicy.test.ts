import { describe, expect, it } from "vitest";
import {
  resolveIntakeCreateReviewPostGenerationContext,
  resolveSimpleHomeReviewPostGenerationContext,
  resolveWizardDetailsPostGenerationContext,
  shouldUseCanonicalPostGenerationFlow,
} from "./agreementPostGenerationPolicy";

describe("agreementPostGenerationPolicy", () => {
  it("enables wizard details context for embedded workspace details step", () => {
    expect(
      resolveWizardDetailsPostGenerationContext({
        embeddedInCard: true,
        section: "details",
        isWorkspace: true,
      }),
    ).toBe("wizard_details");
  });

  it("enables simple home review context during review phase", () => {
    expect(
      resolveSimpleHomeReviewPostGenerationContext({
        section: "simpleHomeReview",
        simpleFlowPhase: "review",
        canonicalUnpaidSendShell: false,
        sendShellTierGatePending: false,
      }),
    ).toBe("simple_home_review");
  });

  it("requires review phase for simple home canonical flow", () => {
    expect(
      resolveSimpleHomeReviewPostGenerationContext({
        section: "simpleHomeReview",
        simpleFlowPhase: "send",
        canonicalUnpaidSendShell: false,
        sendShellTierGatePending: false,
      }),
    ).toBeNull();
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context: "simple_home_review",
        hasDraft: true,
        isReviewPhase: false,
      }),
    ).toBe(false);
  });

  it("enables intake create review for free streamline drafts", () => {
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
        showPrimaryGuidedCompletion: false,
      }),
    ).toBe("intake_create_review");
  });

  it("skips intake create review for paid pro surfaces", () => {
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: true,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
      }),
    ).toBeNull();
  });

  it("skips intake create review for returning workspace-pro users", () => {
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
        shellInput: { workspaceProEntitled: true, tier: "free" },
      }),
    ).toBeNull();
  });
});
