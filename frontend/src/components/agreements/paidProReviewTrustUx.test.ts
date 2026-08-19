import { describe, expect, it } from "vitest";
import {
  PAID_PRO_FINAL_VERSION_BEFORE_SIGNERS,
  PAID_PRO_FINAL_VERSION_READY_FOR_SIGNATURE,
  PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS,
  PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS,
  PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE,
  formatPaidProSignerSavedMappings,
  resolvePaidProFinalVersionCopy,
  resolvePaidProReviewSupportingCopy,
  resolvePaidProReviewTrustSteps,
} from "./paidProReviewTrustUx";

describe("paidProReviewTrustUx", () => {
  it("before signer setup shows agreement generated and signer-required steps", () => {
    const steps = resolvePaidProReviewTrustSteps({ signersReady: false });
    expect(steps.map((s) => s.label)).toEqual([
      "Agreement draft generated",
      "Automated draft checks completed",
      "Add signer details",
      "Review or signature links",
    ]);
    expect(steps.filter((s) => s.state === "done").map((s) => s.id)).toEqual([
      "agreement_generated",
      "legal_review_complete",
    ]);
    expect(steps.find((s) => s.id === "signer_details")?.state).toBe("active");
    expect(resolvePaidProReviewSupportingCopy({ signersReady: false })).toBe(
      PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS,
    );
    expect(resolvePaidProFinalVersionCopy({ signersReady: false })).toBe(
      PAID_PRO_FINAL_VERSION_BEFORE_SIGNERS,
    );
  });

  it("after signer finalize + signing-ready corpus shows ready-for-signing step", () => {
    const steps = resolvePaidProReviewTrustSteps({
      signersReady: true,
      signerMetadataFinalized: true,
      signingReadyHydrated: true,
    });
    expect(steps.map((s) => s.label)).toEqual([
      "Agreement generated",
      "Automated draft checks completed",
      "Signer details added",
      "Ready to create signing links",
    ]);
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(resolvePaidProReviewSupportingCopy({ signersReady: true })).toBe(
      PAID_PRO_REVIEW_SUPPORTING_AFTER_SIGNERS,
    );
    expect(resolvePaidProFinalVersionCopy({ signersReady: true })).toBe(
      PAID_PRO_FINAL_VERSION_READY_FOR_SIGNATURE,
    );
  });

  it("does not claim Ready for signing before finalize produces a signing-ready corpus", () => {
    const beforeFinalize = resolvePaidProReviewTrustSteps({ signersReady: true });
    expect(beforeFinalize.find((s) => s.id === "signature_links_ready")?.label).toBe(
      "Choose review or signing",
    );
    expect(beforeFinalize.find((s) => s.id === "signature_links_ready")?.state).toBe("pending");
    const hydrateFailed = resolvePaidProReviewTrustSteps({
      signersReady: true,
      signerMetadataFinalized: true,
      signingReadyHydrated: false,
    });
    expect(hydrateFailed.find((s) => s.id === "signature_links_ready")?.label).not.toMatch(
      /Ready for signing\b/i,
    );
  });

  it("formats party → signer mapping lines for confirmation banner", () => {
    expect(
      formatPaidProSignerSavedMappings([
        { partyLegalName: "Blue Canyon Analytics LLC", signerName: "Anthem H Blanchard" },
        { partyLegalName: "Iron Vale Systems Inc.", signerName: "Ira Vee" },
      ]),
    ).toEqual([
      "Blue Canyon Analytics LLC\n→ Anthem H Blanchard",
      "Iron Vale Systems Inc.\n→ Ira Vee",
    ]);
    expect(PAID_PRO_SIGNER_SAVED_BANNER_HEADLINE).toBe("Signer details saved.");
  });
});
