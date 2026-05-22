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
  sendIntentSelected: false,
  signingPacketSetupActive: false,
  guidedBulkApplying: false,
};

describe("resolveGuidedProUxState — GTM sequence (test19/test20)", () => {
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

  it("ready_to_apply always maps to signer_setup_required (test20 — no paid_pro_draft regression)", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        signerSlotsComplete: true,
      }),
    ).toBe("signer_setup_required");
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "draft_ready_for_review",
        signerSlotsComplete: false,
      }),
    ).toBe("signer_setup_required");
  });

  it("applying maps to guided_applying_updates only after explicit apply", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applying_all",
        createFlowPhase: "signer_setup_required",
      }),
    ).toBe("guided_applying_updates");
  });

  it("applied without explicit review maps to updated_agreement_ready", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "updated_agreement_ready",
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
        sendIntentSelected: true,
        premiumRecipientUxActive: true,
      }),
    ).toBe("send_intent_selected");
  });

  it("suppresses production send during signer setup", () => {
    expect(guidedProUxSuppressesProductionSendCta("signer_setup_required")).toBe(true);
    expect(guidedProUxSuppressesProductionSendCta("guided_final_review")).toBe(false);
  });

  it("sticky CTA: incomplete signer setup stays disabled; complete enables apply", () => {
    expect(resolveGuidedProStickyCta("signer_setup_required", 0, false)?.disabled).toBe(true);
    expect(resolveGuidedProStickyCta("signer_setup_required", 0, false)?.label).toBe("Add signer details");
    expect(resolveGuidedProStickyCta("signer_setup_required", 0, true)?.disabled).toBe(false);
    expect(resolveGuidedProStickyCta("signer_setup_required", 0, true)?.label).toBe(
      "Apply answers and prepare review",
    );
    expect(resolveGuidedProStickyCta("signer_setup_required", 0, true)?.reason).toBe(
      "signer_setup_ready_apply",
    );
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

  it("guidedProUxAllowsRecipientSetup for send_intent_selected only", () => {
    expect(guidedProUxAllowsRecipientSetup("send_intent_selected")).toBe(true);
    expect(guidedProUxAllowsRecipientSetup("signer_setup_required")).toBe(false);
  });

  it("shows question panel only during questions", () => {
    expect(guidedProUxShowsQuestionPanel("guided_questions_active")).toBe(true);
    expect(guidedProUxShowsSignerSetup("signer_setup_required")).toBe(true);
    expect(guidedProUxShowsQuestionPanel("signer_setup_required")).toBe(false);
    expect(guidedProUxShowsUpdatedReadyCard("updated_agreement_ready")).toBe(true);
    expect(guidedProUxShowsFinalReview("guided_final_review")).toBe(true);
    expect(guidedProUxSuppressesFreeform("signer_setup_required")).toBe(true);
  });
});
