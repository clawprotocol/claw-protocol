import { describe, expect, it } from "vitest";
import { buildPremiumAgreementReadonlyHtml, escapeHtml } from "./premiumAgreementDocumentHtml";

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`a<b>"c"`)).toBe("a&lt;b&gt;&quot;c&quot;");
  });
});

describe("buildPremiumAgreementReadonlyHtml", () => {
  const baseOpts = {
    partyNameA: "A",
    partyNameB: "B",
  } as const;

  it("wraps numbered section labels as h2 and body as p", () => {
    const plain = `CONSULTING AGREEMENT

Between parties.

1. SCOPE OF SERVICES · PURPOSE

Party A shall perform work.

2. PAYMENT TERMS

Net 30.`;
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      ...baseOpts,
      signatureSectionMode: "collaboration",
    });
    expect(html).toContain("<h1>CONSULTING AGREEMENT</h1>");
    expect(html).toContain("<h2>1. SCOPE OF SERVICES · PURPOSE</h2>");
    expect(html).toContain("<h2>2. PAYMENT TERMS</h2>");
    expect(html).toContain("Party A shall perform work");
    expect(html).not.toContain("<script");
  });

  it("injects payment callout after section 2 when hinted", () => {
    const plain = `CONSULTING AGREEMENT

2. PAYMENT TERMS

Net 30.`;
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      ...baseOpts,
      signatureSectionMode: "collaboration",
      renderHints: {
        paymentNeedsFinalNumbers: true,
        partiesNeedLegalNames: false,
        jurisdictionNeedsSelection: false,
      },
    });
    expect(html).toContain("Needs final numbers");
  });

  it("always appends a signature section for collaboration and execution modes", () => {
    const htmlCollab = buildPremiumAgreementReadonlyHtml("TITLE\n\nBody.", {
      ...baseOpts,
      partyNameA: "Acme LLC",
      partyNameB: "Beta LLC",
      signatureSectionMode: "collaboration",
    });
    expect(htmlCollab).toContain("Signatures");
    expect(htmlCollab).toContain("Acme LLC");
    expect(htmlCollab).toContain("Beta LLC");
    expect(htmlCollab).toContain("Signature");
    expect(htmlCollab).toMatch(/print name/i);
    expect(htmlCollab).not.toContain("Initials");

    const htmlExec = buildPremiumAgreementReadonlyHtml("TITLE\n\nBody.", {
      ...baseOpts,
      partyNameA: "Acme LLC",
      partyNameB: "Beta LLC",
      signatureSectionMode: "execution",
    });
    expect(htmlExec).toContain("Execution — Signatures");
    expect(htmlExec).toContain("Initials");
  });

  it("uses tasteful placeholder labels when party names are generic", () => {
    const html = buildPremiumAgreementReadonlyHtml("T\n\nB.", {
      partyNameA: "Party A",
      partyNameB: "Party B",
      signatureSectionMode: "collaboration",
    });
    expect(html).toContain("Party A / Authorized Signer");
    expect(html).toContain("Party B / Authorized Signer");
  });
});
