import { describe, expect, it } from "vitest";
import {
  buildPremiumAgreementReadonlyHtml,
  resolvePremiumSignaturePreviewMode,
  stripStarterPreviewDisclaimerFromPlainText,
} from "./premiumAgreementDocumentHtml";

describe("stripStarterPreviewDisclaimerFromPlainText", () => {
  it("removes simplified starter preview disclaimer lines", () => {
    const plain = "SERVICES AGREEMENT\n\nThis is a simplified starter preview for review.\n\n1. SCOPE";
    expect(stripStarterPreviewDisclaimerFromPlainText(plain)).not.toMatch(/simplified starter preview/i);
    expect(stripStarterPreviewDisclaimerFromPlainText(plain)).toContain("1. SCOPE");
  });
});

describe("buildPremiumAgreementReadonlyHtml", () => {
  it("does not render starter disclaimer in Pro readonly html", () => {
    const html = buildPremiumAgreementReadonlyHtml(
      "AGREEMENT\n\nThis is a simplified starter preview only.\n\n1. PAYMENT TERMS",
      { signatureSectionMode: "collaboration", partyNames: ["A", "B"] },
    );
    expect(html).not.toMatch(/simplified starter preview/i);
    expect(html).toContain("PAYMENT");
  });

  it("renders executive framing callout under title when hints provided", () => {
    const html = buildPremiumAgreementReadonlyHtml("INFLUENCER SERVICES AGREEMENT\n\n1. SCOPE", {
      signatureSectionMode: "collaboration",
      partyNames: ["A", "B"],
      renderHints: {
        paymentNeedsFinalNumbers: false,
        partiesNeedLegalNames: false,
        jurisdictionNeedsSelection: false,
        executiveFramingLine: "Built for a paid creator or brand collaboration.",
        contradictionDocumentNote: null,
      },
    });
    expect(html).toContain("premium-doc-callout");
    expect(html).toMatch(/creator or brand collaboration/i);
  });

  it("does not append decorative signature card when corpus already has execution lines", () => {
    const plain = `
SERVICES AGREEMENT

1. SCOPE
The parties agree to work together.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Date: _________________________

SERVICE PROVIDER:
Joe Lewis
Signature: __________________________
Name: Joe Lewis
Date: _________________________
`.trim();
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "execution",
      partyNames: ["Acme LLC", "Joe Lewis"],
    });
    expect(resolvePremiumSignaturePreviewMode(plain, 2).mode).toBe("embedded_corpus_signature_block");
    expect(html).toMatch(/IN WITNESS WHEREOF/i);
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).not.toMatch(/The lines below mirror a traditional signature page/i);
  });

  it("renders decorative signature card only when corpus lacks execution block", () => {
    const html = buildPremiumAgreementReadonlyHtml("SERVICES AGREEMENT\n\n1. SCOPE\nThe parties agree.", {
      signatureSectionMode: "execution",
      partyNames: ["Acme LLC", "Joe Lewis"],
    });
    expect(html).toContain("claw-premium-signature-section");
    expect(html).toMatch(/Execution — Signatures/i);
  });
});
