import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("enables simple home review context during review phase for paid Pro users only", () => {
    // Paid Pro (simpleFlowUpsellSuppressed=true) gets the context
    expect(
      resolveSimpleHomeReviewPostGenerationContext({
        section: "simpleHomeReview",
        simpleFlowPhase: "review",
        canonicalUnpaidSendShell: false,
        sendShellTierGatePending: false,
        simpleFlowUpsellSuppressed: true,
      }),
    ).toBe("simple_home_review");
    // Free/guest (simpleFlowUpsellSuppressed=false) does NOT get the relic context
    expect(
      resolveSimpleHomeReviewPostGenerationContext({
        section: "simpleHomeReview",
        simpleFlowPhase: "review",
        canonicalUnpaidSendShell: false,
        sendShellTierGatePending: false,
        simpleFlowUpsellSuppressed: false,
      }),
    ).toBeNull();
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

  it("suppresses canonical post-generation flow for homepage guest free starter (simple starter shell only)", () => {
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
    ).toBeNull();
  });

  it("suppresses canonical post-generation flow for signed-in dashboard Create (simple starter shell only)", () => {
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: false,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        showPrimaryGuidedCompletion: false,
      }),
    ).toBeNull();
  });

  it("allows intake create review only for paid Pro after opt-in (paidProAuthoritative)", () => {
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: false,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        showPrimaryGuidedCompletion: false,
      }),
    ).toBeNull();
  });

  it("allows intake create review only for paid Pro after opt-in (premiumPaidDocumentSurface)", () => {
    expect(
      resolveIntakeCreateReviewPostGenerationContext({
        isFreeStreamlineDraftReview: false,
        productionDraftPrimaryReviewSurface: true,
        createUiStage: "DRAFT",
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: true,
        premiumPersistedFlowActive: false,
        showPrimaryGuidedCompletion: false,
      }),
    ).toBeNull();
  });

  it("paid pro authoritative suppresses via shouldSuppressIntakeCanonicalPostGeneration", () => {
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

describe("simple starter shell locks out relic UI on ALL create entries", () => {
  it("homepage guest (isFreeStreamlineDraftReview) does not mount the relic DRAFT CREATED / Review agreement", () => {
    const context = resolveIntakeCreateReviewPostGenerationContext({
      isFreeStreamlineDraftReview: true,
      productionDraftPrimaryReviewSurface: true,
      createUiStage: "DRAFT",
      createFlowPhase: "draft_ready_for_review",
      hasDraft: true,
      paidProAuthoritative: false,
      premiumPaidDocumentSurface: false,
      premiumPersistedFlowActive: false,
      showPrimaryGuidedCompletion: false,
    });
    expect(context).toBeNull();
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context,
        hasDraft: true,
        isReviewPhase: true,
      }),
    ).toBe(false);
  });

  it("signed-in dashboard Create (productionDraftPrimaryReviewSurface) does not mount the relic", () => {
    const context = resolveIntakeCreateReviewPostGenerationContext({
      isFreeStreamlineDraftReview: false,
      productionDraftPrimaryReviewSurface: true,
      createUiStage: "DRAFT",
      createFlowPhase: "draft_ready_for_review",
      hasDraft: true,
      paidProAuthoritative: false,
      premiumPaidDocumentSurface: false,
      premiumPersistedFlowActive: false,
      showPrimaryGuidedCompletion: false,
    });
    expect(context).toBeNull();
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context,
        hasDraft: true,
        isReviewPhase: true,
      }),
    ).toBe(false);
  });

  it("AgreementBuilderIntake renders StarterDraftDocumentSurface for free starter review", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("StarterDraftDocumentSurface");
    expect(intake).toContain("freeStarterReviewShellActive");
    expect(intake).toContain("useStarterDocumentPaperSurface");
  });
});

describe("simple starter shell locks out relic UI on simpleHomeReview (send page)", () => {
  it("homepage guest on /app/send does not mount the relic DRAFT CREATED / Review agreement", () => {
    const context = resolveSimpleHomeReviewPostGenerationContext({
      section: "simpleHomeReview",
      simpleFlowPhase: "review",
      canonicalUnpaidSendShell: false,
      sendShellTierGatePending: false,
      simpleFlowUpsellSuppressed: false,
    });
    expect(context).toBeNull();
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context,
        hasDraft: true,
        isReviewPhase: true,
      }),
    ).toBe(false);
  });

  it("signed-in free user on /app/send does not mount the relic DRAFT CREATED / Review agreement", () => {
    const context = resolveSimpleHomeReviewPostGenerationContext({
      section: "simpleHomeReview",
      simpleFlowPhase: "review",
      canonicalUnpaidSendShell: false,
      sendShellTierGatePending: false,
      simpleFlowUpsellSuppressed: false,
    });
    expect(context).toBeNull();
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context,
        hasDraft: true,
        isReviewPhase: true,
      }),
    ).toBe(false);
  });

  it("paid Pro user on /app/send may use the canonical review flow", () => {
    const context = resolveSimpleHomeReviewPostGenerationContext({
      section: "simpleHomeReview",
      simpleFlowPhase: "review",
      canonicalUnpaidSendShell: false,
      sendShellTierGatePending: false,
      simpleFlowUpsellSuppressed: true,
    });
    expect(context).toBe("simple_home_review");
    expect(
      shouldUseCanonicalPostGenerationFlow({
        context,
        hasDraft: true,
        isReviewPhase: true,
      }),
    ).toBe(true);
  });
});
