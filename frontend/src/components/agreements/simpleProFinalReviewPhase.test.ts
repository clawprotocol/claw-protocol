import { describe, expect, it } from "vitest";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";

describe("resolveSimpleProFinalReviewActive", () => {
  it("is true for guided_final_review when recipient UX is off", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "guided_final_review",
        guidedCompletionPhase: "applied",
      }),
    ).toBe(true);
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
