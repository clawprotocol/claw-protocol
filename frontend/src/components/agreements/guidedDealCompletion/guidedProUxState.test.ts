import { describe, expect, it } from "vitest";
import {
  guidedProUxShowsFinalReview,
  guidedProUxShowsQuestionPanel,
  guidedProUxShowsUpdatedReadyCard,
  guidedProUxSuppressesFreeform,
  resolveGuidedProUxState,
} from "./guidedProUxState";

const BASE = {
  premiumPaidDocumentSurface: true,
  hasGuidedSession: true,
  premiumRecipientUxActive: false,
  finalReviewExplicitlyOpened: false,
  signingPacketSetupActive: false,
};

describe("resolveGuidedProUxState — universal agreement families", () => {
  const families = [
    { label: "services", phase: "collecting_answers" as const },
    { label: "marketing", phase: "ready_to_apply" as const },
    { label: "nda", phase: "collecting_answers" as const },
    { label: "saas_automation", phase: "collecting_answers" as const },
    { label: "multi_party", phase: "collecting_answers" as const },
  ];

  for (const { label, phase } of families) {
    it(`${label}: collecting maps to guided_questions_active`, () => {
      expect(
        resolveGuidedProUxState({
          ...BASE,
          guidedCompletionPhase: phase,
          createFlowPhase: "draft_ready_for_review",
        }),
      ).toBe("guided_questions_active");
    });
  }

  it("applying maps to guided_applying_updates", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applying_all",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe("guided_applying_updates");
  });

  it("applied without explicit review maps to updated_agreement_ready", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "updated_agreement_ready",
        finalReviewExplicitlyOpened: false,
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

  it("recipient_setup_required maps to recipient_setup", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE,
        guidedCompletionPhase: "applied",
        createFlowPhase: "recipient_setup_required",
        finalReviewExplicitlyOpened: true,
        premiumRecipientUxActive: true,
      }),
    ).toBe("recipient_setup");
  });

  it("suppresses freeform during questions, apply, and ready", () => {
    expect(guidedProUxSuppressesFreeform("guided_questions_active")).toBe(true);
    expect(guidedProUxSuppressesFreeform("guided_applying_updates")).toBe(true);
    expect(guidedProUxSuppressesFreeform("updated_agreement_ready")).toBe(true);
    expect(guidedProUxSuppressesFreeform("guided_final_review")).toBe(false);
  });

  it("shows question panel only during questions and applying", () => {
    expect(guidedProUxShowsQuestionPanel("guided_questions_active")).toBe(true);
    expect(guidedProUxShowsQuestionPanel("guided_applying_updates")).toBe(true);
    expect(guidedProUxShowsQuestionPanel("updated_agreement_ready")).toBe(false);
    expect(guidedProUxShowsUpdatedReadyCard("updated_agreement_ready")).toBe(true);
    expect(guidedProUxShowsFinalReview("guided_final_review")).toBe(true);
  });
});
