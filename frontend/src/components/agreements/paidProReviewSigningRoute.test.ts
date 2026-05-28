import { describe, expect, it } from "vitest";
import { resolveGuidedProUxState } from "./guidedDealCompletion/guidedProUxState";
import {
  paidProExplicitSignerSetupFromReview,
  shouldBypassGuidedSendCtaBlockForPaidProSignerSetup,
} from "./paidProReviewSigningRoute";

describe("paidProReviewSigningRoute", () => {
  it("allows premium_continue_to_signers when accepted corpus exists and signers are incomplete", () => {
    expect(
      paidProExplicitSignerSetupFromReview({
        ctaAction: "premium_continue_to_signers",
        paidProAcceptedCorpusReady: true,
        paidProInlineSignersReady: false,
      }),
    ).toBe(true);
    expect(
      shouldBypassGuidedSendCtaBlockForPaidProSignerSetup({
        ctaAction: "premium_continue_to_signers",
        paidProAcceptedCorpusReady: true,
        paidProInlineSignersReady: false,
      }),
    ).toBe(true);
  });

  it("does not allow signer setup when paid corpus is not ready (API unavailable)", () => {
    expect(
      paidProExplicitSignerSetupFromReview({
        ctaAction: "premium_continue_to_signers",
        paidProAcceptedCorpusReady: false,
        paidProInlineSignersReady: false,
      }),
    ).toBe(false);
  });

  it("does not bypass when signers are already ready", () => {
    expect(
      shouldBypassGuidedSendCtaBlockForPaidProSignerSetup({
        ctaAction: "premium_continue_to_signers",
        paidProAcceptedCorpusReady: true,
        paidProInlineSignersReady: true,
      }),
    ).toBe(false);
  });

  it("resolveGuidedProUxState maps signer_setup_required without guided session when paid corpus ready", () => {
    expect(
      resolveGuidedProUxState({
        premiumPaidDocumentSurface: true,
        hasGuidedSession: false,
        paidProAcceptedCorpusReady: true,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        premiumRecipientUxActive: false,
        finalReviewExplicitlyOpened: false,
        sendIntentSelected: false,
      }),
    ).toBe("signer_setup_required");
  });
});
