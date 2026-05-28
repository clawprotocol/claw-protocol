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

  it("is true when acceptedPaidProAuthority after checkout without explicit open", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "collecting_answers",
        acceptedPaidProAuthority: true,
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(true);
  });

  it("is true when acceptedPaidProAuthority even if paidProAuthoritative is not yet on draft", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "collecting_answers",
        acceptedPaidProAuthority: true,
        finalReviewExplicitlyOpened: false,
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

  it("stays active during ready_to_send when finalized corpus is pinned", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "ready_to_send",
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
        pinnedFinalizedSignerCorpusHash: "abc123",
      }),
    ).toBe(true);
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
