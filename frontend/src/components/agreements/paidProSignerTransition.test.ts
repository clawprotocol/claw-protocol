import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logPaidProSignerTransition,
  resolvePaidProSignerSetupPrimaryCtaOverride,
  shouldRoutePaidProSignerSetupToReviewDecision,
} from "./paidProSignerTransition";
import { PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON } from "./paidProSignerFinalizeRouting";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

describe("paidProSignerTransition", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("routes paid Pro signer setup to review decision when SoT exists and signers complete", () => {
    establishPaidProSourceOfTruth({ text: SHARED_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    expect(
      shouldRoutePaidProSignerSetupToReviewDecision({
        acceptedPaidProAuthorityActive: false,
        signersComplete: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);
  });

  it("does not route when signature preparation already requested", () => {
    establishPaidProSourceOfTruth({ text: SHARED_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    expect(
      shouldRoutePaidProSignerSetupToReviewDecision({
        acceptedPaidProAuthorityActive: true,
        signersComplete: true,
        signaturePreparationRequested: true,
      }),
    ).toBe(false);
  });

  it("overrides guided final-review CTA for paid Pro review-first signer setup", () => {
    const override = resolvePaidProSignerSetupPrimaryCtaOverride({
      guidedStickyReason: "signer_setup_ready_final_review",
      acceptedPaidProAuthorityActive: true,
      paidProFirstReviewSurfaceActive: true,
      paidProInlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      signersComplete: true,
      ctaLabel: "Continue to review decision",
    });
    expect(override?.reason).toBe(PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON);
    expect(override?.label).toBe("Continue to review decision");
  });

  it("does not override non-paid-pro guided reasons", () => {
    expect(
      resolvePaidProSignerSetupPrimaryCtaOverride({
        guidedStickyReason: "guided_apply_in_progress",
        acceptedPaidProAuthorityActive: true,
        paidProFirstReviewSurfaceActive: true,
        paidProInlineSignerSetupLatched: true,
        signaturePreparationRequested: false,
        signersComplete: true,
        ctaLabel: "Continue",
      }),
    ).toBeNull();
  });

  it("logs transition payload outside test mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProSignerTransition({
      previousState: "signer_setup_required",
      nextState: "draft_ready_for_review",
      navigationTarget: "review_decision",
      reason: "test",
    });
    spy.mockRestore();
  });
});
