import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINALIZE_REFINE_ROUTE_HINT, FINALIZE_REFINE_ROUTE_HINT_REVIEW_ONLY } from "./FinalizeYourAgreementPanel";

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
    expect(s).toContain("Add at least one recipient email to create a review link.");
    expect(s).toContain("Add at least one signer email to continue.");
  });

  it("paid-ready watermark modal wires I will sign first for signature intent and persists via writePremiumSenderSignFirst", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    expect(s).toContain("watermarkModalSignFirst");
    expect(s).toContain("I&apos;ll sign first");
    expect(s).toContain("writePremiumSenderSignFirst");
    expect(s).toContain("PAYWALL_PAID_READY_SUB_SIGNATURE");
    expect(s).toContain("This creates a private link for the reviewer to suggest changes");
  });

  it("streamlined premium signature panel copy uses signature links (not review-link heading)", () => {
    const s = readFileSync(agreementReviewPath, "utf8");
    const i = s.indexOf("Create signature links");
    expect(i).toBeGreaterThanOrEqual(0);
    const window = s.slice(Math.max(0, i - 500), i + 280);
    expect(window).toContain("Generate secure signature links");
    expect(window).not.toContain("Create review links");
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
    expect(FINALIZE_REFINE_ROUTE_HINT_REVIEW_ONLY).toContain("Send for review in the section above");
  });

  it("AgreementReview does not embed generic simple-create marketing headline", () => {
    const s = readFileSync(join(__dirname, "AgreementReview.tsx"), "utf8");
    expect(s).not.toContain("Create an agreement in minutes");
  });

  it("Update agreement is gated on non-empty refine prompt", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("disabled={disabled || busy || !prompt.trim()}");
    expect(s).toContain("Describe a change first");
  });
});
