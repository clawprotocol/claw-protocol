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

  it("uses embedded mode when signature tail has populated Name lines without decorative card", () => {
    const plain = `
AGREEMENT

IN WITNESS WHEREOF, the Parties execute this Agreement.

Blue Canyon Analytics LLC
By: __________________________
Name: Anthem H Blanchard
Title: Member

Iron Vale Systems Inc.
By: __________________________
Name: Jay Ive
Title: Member
`.trim();
    const mode = resolvePremiumSignaturePreviewMode(plain, 2);
    expect(mode.mode).toBe("embedded_corpus_signature_block");
    expect(mode.hasCorpusSignatureBlock).toBe(true);
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).toMatch(/Anthem H Blanchard/);
    expect(html).toMatch(/Jay Ive/);
  });

  it("skips decorative signature card when forceEmbeddedCorpusSignature is set for guided final review", () => {
    const plain = "SERVICES AGREEMENT\n\n1. SCOPE\nThe parties agree.";
    expect(resolvePremiumSignaturePreviewMode(plain, 2, { forceEmbeddedCorpusSignature: true }).mode).toBe(
      "embedded_corpus_signature_block",
    );
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Acme LLC", "Joe Brown"],
      forceEmbeddedCorpusSignature: true,
    });
    expect(html).not.toContain("claw-premium-signature-section");
  });

  it("strips embedded signature region when external signer UI owns execution", () => {
    const plain = `
SERVICES AGREEMENT

1. SCOPE
Provider performs services.

IN WITNESS WHEREOF, the Parties execute.

CLIENT:
Acme LLC
By: __________________________
`.trim();
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "execution",
      partyNames: ["Acme LLC", "Beta LLC"],
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).toContain("SCOPE");
  });

  it("Pro review html sanitizes fused opening and signature below in plain corpus", () => {
    const plain =
      'This AI Workflow Setup Services Agreement ("Agreement") is This Agreement is between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").signature below.\n\n1. SCOPE\nServices.';
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toMatch(/is This Agreement is between/i);
    expect(html).not.toMatch(/signature below|\.signature/i);
    expect(html).toContain("Red Mesa Logistics LLC");
    expect(html).toContain("SCOPE");
  });

  it("Pro review display removes embedded execution fields completely", () => {
    const plain = `
SERVICES AGREEMENT

1. SCOPE
Provider performs AI workflow setup.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: __________________________
Name: ________________________
Title: _______________________
Date: ________________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: __________________________
Name: ________________________
Title: _______________________
Date: ________________________
`.trim();
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(html).not.toMatch(/\bBy\s*:/i);
    expect(html).not.toMatch(/\bName\s*:/i);
    expect(html).not.toMatch(/\bTitle\s*:/i);
    expect(html).not.toMatch(/\bDate\s*:/i);
    expect(html).not.toMatch(/_{3,}/);
    expect(html).not.toContain("claw-premium-signature-section");
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
