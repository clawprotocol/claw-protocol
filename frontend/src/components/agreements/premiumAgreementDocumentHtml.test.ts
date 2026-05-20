import { describe, expect, it } from "vitest";
import {
  buildPremiumAgreementReadonlyHtml,
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
});
