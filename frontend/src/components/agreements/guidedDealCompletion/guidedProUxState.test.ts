import { describe, expect, it } from "vitest";
import {
  guidedProUxAllowsRecipientSetup,
  guidedProUxBlocksRecipientSetup,
  guidedProUxShowsFinalReview,
  guidedProUxShowsQuestionPanel,
  guidedProUxShowsSignerSetup,
  guidedProUxShowsUpdatedReadyCard,
  guidedProUxSuppressesFreeform,
  guidedProUxSuppressesProductionSendCta,
  resolveGuidedProStickyCta,
  resolveGuidedProUxState,
} from "./guidedProUxState";

const BASE = {
  premiumPaidDocumentSurface: true,
  hasGuidedSession: true,
  premiumRecipientUxActive: false,
  finalReviewExplicitlyOpened: false,
  signerSetupComplete: false,
  sendIntentSelected: false,
  signingPacketSetupActive: false,
  guidedBulkApplying: false,
};

describe("resolveGuidedProUxState — GTM sequence (test19)", () => {
  const families = [
    { label: "services", phase: "collecting_answers" as const },
    { label: "saas", phase: "collecting_answers" as const },
    { label: "nda", phase: "collecting_answers" as const },
    { label: "marketing", phase: "ready_to_apply" as const },
    { label: "generic_business", phase: "collecting_answers" as const },
  ];

  for (const { label, phase } of families) {
    it(`${label}: collecting maps to guided_questions_active`, () => {
      if (phase !== "collecting_answers") return;
      expect(
        resolveGuidedProUxState({
          ...BASE,
          guidedCompletionPhase: phase,
          createFlowPhase: "draft_ready_for_review",
        }),
      ).toBe("guided_questions_active");
    });
  }

  it("ready_to_apply without signers maps to signer_setup_required", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        signerSetupComplete: false,
      }),
    ).toBe("signer_setup_required");
  });

  it("applying maps to guided_applying_updates (after signers)", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applying_all",
        createFlowPhase: "signer_setup_required",
        signerSetupComplete: true,
      }),
    ).toBe("guided_applying_updates");
  });

  it("applied without explicit review maps to updated_agreement_ready", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "updated_agreement_ready",
        signerSetupComplete: true,
      }),
    ).toBe("updated_agreement_ready");
  });

  it("applied with explicit review maps to guided_final_review", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "guided_final_review",
        finalReviewExplicitlyOpened: true,
        signerSetupComplete: true,
      }),
    ).toBe("guided_final_review");
  });

  it("send intent after final review maps to send_intent_selected", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "recipient_setup_required",
        finalReviewExplicitlyOpened: true,
        signerSetupComplete: true,
        sendIntentSelected: true,
        premiumRecipientUxActive: true,
      }),
    ).toBe("send_intent_selected");
  });

  it("recipient_setup_required only after send path (no send intent)", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "recipient_setup_required",
        finalReviewExplicitlyOpened: true,
        signerSetupComplete: true,
        premiumRecipientUxActive: true,
      }),
    ).toBe("recipient_setup");
  });

  it("suppresses production send during questions, signer setup, apply, and ready", () => {
    expect(guidedProUxSuppressesProductionSendCta("guided_questions_active")).toBe(true);
    expect(guidedProUxSuppressesProductionSendCta("signer_setup_required")).toBe(true);
    expect(guidedProUxSuppressesProductionSendCta("guided_applying_updates")).toBe(true);
    expect(guidedProUxSuppressesProductionSendCta("updated_agreement_ready")).toBe(true);
    expect(guidedProUxSuppressesProductionSendCta("guided_final_review")).toBe(false);
  });

  it("sticky CTA labels match GTM copy", () => {
    expect(resolveGuidedProStickyCta("guided_questions_active", 3)?.label).toContain("3");
    expect(resolveGuidedProStickyCta("signer_setup_required", 0)?.label).toBe("Add signer details");
    expect(resolveGuidedProStickyCta("guided_applying_updates", 0)?.label).toBe("Updating agreement…");
    expect(resolveGuidedProStickyCta("updated_agreement_ready", 0)?.label).toBe("Review updated agreement");
  });

  it("shows signer setup panel state helper", () => {
    expect(guidedProUxShowsSignerSetup("signer_setup_required")).toBe(true);
    expect(guidedProUxShowsQuestionPanel("signer_setup_required")).toBe(false);
    expect(guidedProUxShowsUpdatedReadyCard("signer_setup_required")).toBe(false);
  });

  it("guidedProUxBlocksRecipientSetup during signer_setup_required phase", () => {
    expect(
      guidedProUxBlocksRecipientSetup({
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(true);
  });

  it("guidedProUxAllowsRecipientSetup for send_intent_selected", () => {
    expect(guidedProUxAllowsRecipientSetup("send_intent_selected")).toBe(true);
    expect(guidedProUxAllowsRecipientSetup("signer_setup_required")).toBe(false);
  });

  it("suppresses freeform during questions, signer setup, apply, and ready", () => {
    expect(guidedProUxSuppressesFreeform("signer_setup_required")).toBe(true);
    expect(guidedProUxSuppressesFreeform("guided_final_review")).toBe(false);
  });

  it("shows question panel only during questions", () => {
    expect(guidedProUxShowsQuestionPanel("guided_questions_active")).toBe(true);
    expect(guidedProUxShowsQuestionPanel("guided_applying_updates")).toBe(false);
    expect(guidedProUxShowsUpdatedReadyCard("updated_agreement_ready")).toBe(true);
    expect(guidedProUxShowsFinalReview("guided_final_review")).toBe(true);
  });
});
