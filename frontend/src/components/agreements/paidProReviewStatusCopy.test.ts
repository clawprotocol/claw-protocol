import { describe, expect, it } from "vitest";
import {
  PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP,
  PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNING,
  PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS,
  PAID_PRO_REVIEW_CHIP_STATE,
  PAID_PRO_REVIEW_CHIP_VERSION,
  PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS,
  resolvePaidProReviewChipState,
} from "./authoritativePaidProReview";
import {
  resolvePaidProReviewSignerStatusReady,
  resolvePaidProReviewTrustSteps,
} from "./paidProReviewTrustUx";

describe("paidProReviewStatusCopy", () => {
  it("chip state matches trust rail while signer details are still needed", () => {
    expect(PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP).toBe(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS);
    expect(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS).toBe("Signer details needed");
    expect(
      resolvePaidProReviewChipState({ signersReady: false, signingLinksCreated: false, reviewFirstNeutral: false }),
    ).toBe(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS);
    expect(resolvePaidProReviewChipState({ signersReady: false })).not.toBe(
      PAID_PRO_REVIEW_CHIP_STATE,
    );
    expect(resolvePaidProReviewChipState({ signersReady: false })).not.toContain(
      "Ready for signature",
    );
  });

  it("chip state advances to prepare signing links after signer metadata is complete", () => {
    expect(
      resolvePaidProReviewChipState({ signersReady: true, signingLinksCreated: false }),
    ).toBe(PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS);
  });

  it("chip state is Ready for signing only after signing links are created", () => {
    expect(
      resolvePaidProReviewChipState({ signersReady: true, signingLinksCreated: true }),
    ).toBe(PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNING);
  });

  it("review signer status treats authoritative snapshot as ready for trust rail and chip", () => {
    expect(
      resolvePaidProReviewSignerStatusReady({
        signerDetailsGateComplete: false,
        hasAuthoritativeSigningSnapshot: true,
      }),
    ).toBe(true);
    expect(
      resolvePaidProReviewChipState({
        signersReady: resolvePaidProReviewSignerStatusReady({
          signerDetailsGateComplete: false,
          hasAuthoritativeSigningSnapshot: true,
        }),
        signingLinksCreated: false,
      }),
    ).toBe(PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS);
    const steps = resolvePaidProReviewTrustSteps({
      signersReady: true,
      signerMetadataFinalized: true,
    });
    expect(steps.find((s) => s.id === "signer_details")?.label).toBe("Signer details added");
    expect(steps.find((s) => s.id === "signer_details")?.state).toBe("done");
  });

  it("review-first neutral chip stays Agreement draft before Prepare signatures", () => {
    expect(
      resolvePaidProReviewChipState({ signersReady: false, reviewFirstNeutral: true }),
    ).toBe(PAID_PRO_REVIEW_CHIP_VERSION);
    expect(
      resolvePaidProReviewChipState({ signersReady: false, reviewFirstNeutral: true }),
    ).not.toBe(PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS);
  });

  it("trust steps do not show Ready for signing while signer details are still needed", () => {
    const steps = resolvePaidProReviewTrustSteps({ signersReady: false });
    const labels = steps.map((s) => s.label).join(" ");
    expect(labels).toContain("Signer details needed");
    expect(labels).not.toMatch(/Ready for signing\b/i);
  });
});
