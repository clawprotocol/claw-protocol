import { describe, expect, it } from "vitest";
import {
  AGREEMENT_PREVIEW_ESIGN_NOTICE,
  buildAgreementPreviewText,
  collapseDuplicateEsignNoticesInFullPreview,
} from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const minimal: ParsedDraftShape = {
  title: "Test Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Alice", role: "party" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Build a widget",
  payment_terms: "$1,000 flat",
  duration: "3 months",
  due_date: null,
  effective_date: "March 1, 2026",
  payment: { amount: null, cadence: null, valid: true },
  termination_summary: "Either party may terminate with 14 days notice.",
};

describe("buildAgreementPreviewText", () => {
  it("includes title parties and sections", () => {
    const t = buildAgreementPreviewText(minimal);
    expect(t).toContain("TEST AGREEMENT");
    expect(t).toContain("Alice");
    expect(t).toContain("Bob");
    expect(t).toContain("This Agreement");
    expect(t).toContain("collectively");
    expect(t).toContain("1. Scope");
    expect(t).toContain("5. Termination");
    expect(t).toContain("14 days notice");
    expect(t).toContain(AGREEMENT_PREVIEW_ESIGN_NOTICE);
    const esignCount = t.split(AGREEMENT_PREVIEW_ESIGN_NOTICE).length - 1;
    expect(esignCount).toBe(1);
    expect(t).not.toMatch(/SIGNATURES\s*\(PLACEHOLDER\)/i);
  });

  it("omits additional-terms section when empty and softens empty termination line", () => {
    const sparse: ParsedDraftShape = {
      ...minimal,
      termination_summary: "",
      additional_terms: "",
    };
    const t = buildAgreementPreviewText(sparse);
    expect(t).toContain("Compensation and payment terms shall be defined as agreed between the Parties");
    expect(t).not.toContain("6. Additional Terms");
  });

  it("does not echo raw prompt text in party preamble when names look like intake instructions", () => {
    const prompty: ParsedDraftShape = {
      ...minimal,
      parties: [
        {
          name: "Create a contracting agreement between ABC LLC and Voyage LLC for marketing services",
          role: "party",
        },
        { name: "Second line filler", role: "party" },
      ],
    };
    const t = buildAgreementPreviewText(prompty);
    expect(t).toContain("ABC LLC and Voyage LLC");
    expect(t).not.toMatch(/Create a contracting agreement between/i);
  });

  it("starterPreview replaces low-confidence jurisdiction and compresses long purpose", () => {
    const longPurpose = `${"Deliver professional services for the project. ".repeat(25)}Follow client guidelines.`;
    const d: ParsedDraftShape = {
      ...minimal,
      jurisdiction: "Their Lobby",
      purpose: longPurpose,
    };
    const t = buildAgreementPreviewText(d, { starterPreview: true });
    expect(t).toContain("To be agreed in review");
    expect(t).not.toContain("Their Lobby");
    expect(t).toContain("simplified starter preview");
    const scopeSection = t.split("1. Scope of Services / Purpose")[1]?.split("2. Payment Terms")[0] ?? "";
    expect(scopeSection.length).toBeLessThan(longPurpose.length + 80);
  });

  it("premiumDeliverablePreview uses upgraded intro and spacing", () => {
    const t = buildAgreementPreviewText(minimal, { starterPreview: false, premiumDeliverablePreview: true });
    expect(t).toContain("This LawDog Pro agreement is organized for your review");
    expect(t).toMatch(/\n\nThis Agreement/);
  });

  it("premium dynamic workstreams replace fixed five-slot headings when corpus is clause-dense", () => {
    const richAdditional = [
      "• Spend approval: Client approves media spend over $2,500 weekly test budget.",
      "• Ad accounts & pixels: Client owns accounts, pixels, audiences; Agency receives admin access only.",
      "• Subcontractors: No undisclosed subcontractors for material deliverables.",
      "• Reporting: Weekly readouts with spend, delivery, and tests.",
      "• FTC / claims: Externally facing claims require substantiation and approval.",
      "• Termination: Forty-five days notice with orderly credential revocation.",
    ].join("\n");
    const richPurpose =
      "The Agency shall obtain written approval before increasing spend. The Client shall retain ownership of advertising accounts, pixels, and performance data.\n\n" +
      "Either Party may terminate on forty-five days written notice with cooperation on pausing spend and revoking access credentials.";
    const d: ParsedDraftShape = {
      ...minimal,
      purpose: richPurpose,
      payment_terms:
        "Fees invoiced monthly in arrears; pass-through spend pre-approved above test budget. Commission 5% on attributed revenue after cleared funds.",
      additional_terms: richAdditional,
      termination_summary:
        "Either party may terminate with 45 days written notice; confidentiality and payment for work performed survive as stated herein.",
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).toMatch(/LawDog Pro agreement groups related commercial topics/i);
    expect(t).toMatch(/FEES & SPEND|OWNERSHIP OF ACCOUNTS|REPORTING|SUBCONTRACT|COMPLIANCE/i);
    expect(t).not.toMatch(/1\. SCOPE OF SERVICES/i);
    expect(t.split(AGREEMENT_PREVIEW_ESIGN_NOTICE).length - 1).toBe(1);
  });

  it("premium deliverable replaces weak parenthetical payment placeholder", () => {
    const d: ParsedDraftShape = {
      ...minimal,
      payment_terms: "Net 30. (Other payment terms not specified.)",
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).toMatch(/schedules, statements of work, or written approvals/i);
    expect(t).not.toMatch(/other payment terms not specified/i);
  });

  it("premium deliverable does not collapse empty payment_terms to [Not yet specified] when structured amount exists", () => {
    const d: ParsedDraftShape = {
      ...minimal,
      payment_terms: "",
      payment: { amount: 1200, cadence: "monthly", valid: true },
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).not.toContain("[Not yet specified]");
    expect(t).toMatch(/\$1,200/);
    expect(t).toMatch(/monthly payment/i);
  });

  it("routes referral economics payment chunk to fees or referral, not transition", () => {
    const d: ParsedDraftShape = {
      ...minimal,
      title: "Referral Partner Agreement",
      purpose: "Partner introduces qualified business clients; company pays referral commissions based on collected revenue.",
      payment_terms:
        "Company pays referral partner 12% of collected revenue for each referred client for the first 12 months. Monthly reporting ledger provided. Unpaid commissions survive termination.",
      additional_terms: "",
      termination_summary: "",
      duration: "Until terminated on 30 days notice",
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).toMatch(/LawDog Pro agreement groups related commercial topics/i);
    expect(t).toMatch(/FEES\s*&\s*SPEND|REFERRAL,\s*ATTRIBUTION/i);
    expect(t).not.toMatch(/2\.\s+TRANSITION,\s*NOTICE\s*&\s*EXIT/i);
  });

  it("premium dynamic workstreams activate for fee-dense payment without 880-char corpus", () => {
    const d: ParsedDraftShape = {
      ...minimal,
      title: "Monthly Bookkeeping Services Agreement",
      purpose: "Provide monthly bookkeeping including reconciliations and monthly reports for the client.",
      payment_terms: "Fee of $1,200 per month. Invoices are due in 10 days.",
      additional_terms: "",
      termination_summary: "",
      duration: null,
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).toMatch(/LawDog Pro agreement groups related commercial topics/i);
    expect(t).not.toMatch(/^1\. SCOPE OF SERVICES/m);
    expect(t).toMatch(/\$1,200/);
  });

  it("marketing agency dense scope shows OWNERSHIP OF ACCOUNTS & Data prestige after commercial (scope ‘reporting’ list tail is not a reporting workstream pull)", () => {
    const d: ParsedDraftShape = {
      ...minimal,
      title: "Marketing Agency & Growth Services Agreement",
      purpose:
        "The Agency will provide growth marketing, paid social, and ad operations for the Client, including ad account and Business Manager access, audience, pixel, and lookalike management, CRM and customer data use only as directed, landing page updates, and full-funnel creative production; " +
        "Agency will align ad buying, retargeting, and related tracking, and reporting, and platform policy compliance, without weekly dashboard packages unless separately scheduled. " +
        "The Client remains owner of ad accounts, email lists, pixels, customer data, and all landing pages, creatives, and funnels, which remain the Client’s; the Agency will not re-use the Client’s funnels, audiences, or first-party data for other customers. " +
        "Each party may terminate the engagement on 30 days written notice.",
      payment_terms:
        "A monthly program fee of $4,200 plus pass-through ad spend, invoiced monthly; optional 3% of attributed e-comm when elected in writing.",
      additional_terms:
        "• Governing law: New York. • No undisclosed subcontractors for material work. • Agency does not own client ad accounts, pixels, or audiences after termination.\n" +
        "• Compliance: ad standards and no misleading claims, plus cooperation on any platform ad reviews.",
      termination_summary:
        "On exit, Agency will cease use of access credentials, export campaign artifacts as the Client requests, and return or delete customer lists only as the Client approves; ownership of accounts and data is not transferred by this section.",
    };
    const t = buildAgreementPreviewText(d, { premiumDeliverablePreview: true });
    expect(t).toMatch(/OWNERSHIP OF ACCOUNTS (&|AND) DATA/i);
    const lineHeadings = t
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\s+[A-Za-z&]/.test(l));
    expect(
      lineHeadings[0],
      "commercial scope is still section 1 when a dense media scope is present",
    ).toMatch(/1\.\s+COMMERCIAL/i);
    expect(
      lineHeadings[1],
      "ownership prestige should be visible in section 2, not a pulled reporting block",
    ).toMatch(/2\.\s+OWNERSHIP OF ACCOUNTS/i);
  });

  it("collapseDuplicateEsignNoticesInFullPreview leaves a single LawDog footer", () => {
    const doubled = `Title\n\nBody\n\n${AGREEMENT_PREVIEW_ESIGN_NOTICE}\n\n${AGREEMENT_PREVIEW_ESIGN_NOTICE}\n`;
    const once = collapseDuplicateEsignNoticesInFullPreview(doubled);
    expect(once.split(AGREEMENT_PREVIEW_ESIGN_NOTICE).length - 1).toBe(1);
  });

  it("uses LLC operating agreement shell when agreement_family is operating_agreement", () => {
    const oa: ParsedDraftShape = {
      ...minimal,
      agreement_family: "operating_agreement",
      title: "Operating Agreement — ABC LLC",
      llc_company_name: "ABC LLC",
      jurisdiction: "Oklahoma",
      purpose: "Governance of ABC LLC.",
      payment_terms: "N/A",
    };
    const t = buildAgreementPreviewText(oa);
    expect(t).toContain("OPERATING AGREEMENT");
    expect(t).toContain("ENTITY");
    expect(t).toContain("ABC LLC");
    expect(t).toContain("Oklahoma");
    expect(t).toContain("MANAGEMENT");
  });
});
