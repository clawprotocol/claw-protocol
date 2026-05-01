import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINALIZE_REFINE_ROUTE_HINT } from "./FinalizeYourAgreementPanel";

describe("AgreementReview simple paid Pro /app/send surface", () => {
  const agreementReviewPath = join(__dirname, "AgreementReview.tsx");

  it("uses simplePaidProAuthoritativeSendSurface to flatten recipients and hide v1 clutter", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    expect(s).toContain("simplePaidProAuthoritativeSendSurface");
    expect(s).toContain('id="simple-send-recipients-v1-anchor"');
    expect(s).toContain("[create-review-links-click]");
    expect(s).toContain("!simplePaidProAuthoritativeSendSurface ?");
    expect(s).toContain("Recipients and delivery setup");
  });

  it("paid authoritative send: auto-opens paid-ready modal and collapses Create-review-links primary path", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    expect(s).toContain("paidProAuthoritativeSendHappyPath");
    expect(s).toContain("autoPaidAuthoritativeSendConfirmPrimedKeyRef");
    expect(s).toContain("setWatermarkSendModalOpen(true)");
    expect(s).toContain("Review and send");
    expect(s).toContain("Add at least one recipient email to create review links.");
    expect(s).toContain("Add at least one signer email to continue.");
  });

  it("does not reintroduce premium review recipient validation bypass", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    expect(s).not.toContain("shouldBypassFlexibleSendRecipientValidationForPremiumReview");
    expect(s).not.toContain("premiumReviewLinkRecipientBypass");
  });

  it("shows inline guidance when review links need recipient emails", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    expect(s).toContain("Add at least one recipient email in Recipients below");
  });
});

describe("FinalizeYourAgreementPanel Pro copy", () => {
  it("exports the route hint used above review/signature actions", () => {
    expect(FINALIZE_REFINE_ROUTE_HINT).toContain("Need changes?");
    expect(FINALIZE_REFINE_ROUTE_HINT).toContain("Send for review or Send for signature above");
    expect(FINALIZE_REFINE_ROUTE_HINT).not.toContain("Add a short note");
  });

  it("Update agreement is gated on non-empty refine prompt", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("disabled={disabled || busy || !prompt.trim()}");
    expect(s).toContain("Describe a change first");
  });
});
