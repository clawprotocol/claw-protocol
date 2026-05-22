import { describe, expect, it } from "vitest";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";

describe("resolveSimpleProFinalReviewActive", () => {
  it("is true for guided_final_review when recipient UX is off and user opened review", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "guided_final_review",
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe(true);
  });

  it("is false when applied but user has not opened final review yet", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "updated_agreement_ready",
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(false);
  });

  it("is false when recipient UX is active", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: true,
        createFlowPhase: "guided_final_review",
        guidedCompletionPhase: "applied",
      }),
    ).toBe(false);
  });

  it("is false after recipient_setup_required", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "recipient_setup_required",
        guidedCompletionPhase: "applied",
      }),
    ).toBe(false);
  });
});
