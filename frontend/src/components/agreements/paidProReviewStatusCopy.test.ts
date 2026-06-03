import { describe, expect, it } from "vitest";
import {
  PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP,
  PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNING,
  PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS,
  PAID_PRO_REVIEW_CHIP_STATE,
  resolvePaidProReviewChipState,
} from "./authoritativePaidProReview";
import { resolvePaidProReviewTrustSteps } from "./paidProReviewTrustUx";

describe("paidProReviewStatusCopy", () => {
  it("chip state is Ready for signer setup while signer details are still needed", () => {
    expect(
      resolvePaidProReviewChipState({ signersReady: false, signingLinksCreated: false }),
    ).toBe(PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP);
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

  it("trust steps do not show Ready for signing while signer details are still needed", () => {
    const steps = resolvePaidProReviewTrustSteps({ signersReady: false });
    const labels = steps.map((s) => s.label).join(" ");
    expect(labels).toContain("Signer details needed");
    expect(labels).not.toMatch(/Ready for signing\b/i);
  });
});
