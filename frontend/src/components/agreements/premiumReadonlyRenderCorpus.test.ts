import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildPremiumDeliverablePlainTextFromDraft,
  pickPremiumPaidReadonlyPlainText,
  premiumRenderCorpusContainsSignals,
  scorePremiumReadonlyCorpusCandidate,
} from "./premiumReadonlyRenderCorpus";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function richConsultingDraft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: "Acme LLC", role: "party" },
      { name: "Beta LLC", role: "party" },
    ],
    purpose:
      "Marketing advisory including campaign analytics, CRM integration, and sales partner enablement with exclusivity in the US Northeast.",
    payment_terms:
      "Base compensation: $5,000 monthly. Commissions: 10% on qualified net revenue with 90-day clawback on refunded deals. Reimburse pre-approved travel within 14 days.",
    duration: "Initial term of twelve months with renewal as stated in a schedule.",
    due_date: null,
    effective_date: "Upon full execution.",
    termination_summary:
      "Either party may terminate for material breach, scandal or ethics concerns, or with 60 days written notice; disputes per AAA rules.",
    additional_terms:
      "Client owns deliverables and lead data exports. Exclusivity: US Northeast territory for competing engagements.",
    payment: emptyPayment,
  };
}

function acceptableFullDocumentStub(): string {
  const body = "Deliverables and services line.\n\n".repeat(120);
  return [
    "Whereas the parties wish to set forth their agreement; now therefore:",
    body,
    "1. SCOPE. Provider will perform services. 2. FEES. Payment and invoicing as set forth. 3. IP. Work product ownership. ",
    "4. CONFIDENTIALITY. Confidential information protections. 5. TERM. Initial term and renewal. 6. Termination. Either party may terminate for material breach. ",
    "7. Indemnity. 8. Limitation of liability. 9. Dispute resolution; governing law. 10. Notices. 11. Miscellaneous including entire agreement and severability. ",
    "ELECTRONIC signature and COUNTERPARTS. Signature block for Party A. Signature block for Party B.",
  ].join("\n");
}

describe("buildPremiumDeliverablePlainTextFromDraft", () => {
  it("uses premium_full_document_text when it passes the quality bar", () => {
    const full = acceptableFullDocumentStub();
    const d: ParsedDraftShape = { ...richConsultingDraft(), premium_full_document_text: full };
    expect(buildPremiumDeliverablePlainTextFromDraft(d).trim()).toBe(full.trim());
  });
});

describe("pickPremiumPaidReadonlyPlainText", () => {
  it("prefers completion snapshot over thin agreementDocumentText when snapshot is richer", () => {
    const draft = richConsultingDraft();
    const snap = buildPremiumDeliverablePlainTextFromDraft(draft);
    const thinAdt = [
      "CONSULTING AGREEMENT",
      "",
      "1. SCOPE OF SERVICES / PURPOSE",
      "Cleaning services",
      "",
      "2. PAYMENT TERMS",
      "$7,500",
      "",
      "3. TERM AND EFFECTIVE DATE",
      "Term: Paid monthly",
      "",
    ].join("\n");

    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: snap,
      draft: { ...draft, purpose: "Cleaning services", payment_terms: "$7,500", duration: "Paid monthly" },
      agreementDocumentText: thinAdt,
      intakeText:
        "Marketing advisory including campaign analytics, CRM integration, and sales partner enablement with exclusivity in the US Northeast.",
    });

    expect(out.sourceUsed).toBe("legacy_snapshot");
    expect(scorePremiumReadonlyCorpusCandidate(out.plainText)).toBeGreaterThan(scorePremiumReadonlyCorpusCandidate(thinAdt));
    const sig = premiumRenderCorpusContainsSignals(out.plainText);
    expect(sig.contains_commission).toBe(true);
    expect(sig.contains_reimburs).toBe(true);
    expect(sig.contains_exclusivity).toBe(true);
    expect(sig.contains_clawback).toBe(true);
    expect(out.plainText.toLowerCase()).not.toMatch(/cleaning services/);
    expect(out.plainText).not.toMatch(/\$7,500/);
    expect(out.plainText.toLowerCase()).not.toMatch(/^term:\s*paid monthly$/m);
  });

  it("rebuilds from draft when snapshot missing and draft is richer than agreementDocumentText", () => {
    const draft = richConsultingDraft();
    const rebuilt = buildPremiumDeliverablePlainTextFromDraft(draft);
    const thinAdt = "CONSULTING\n\nScope\nConsulting advisory services.\n\nPayment\n$7,500\n\nTerm\nPaid monthly\n";

    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft,
      agreementDocumentText: thinAdt,
    });

    expect(out.sourceUsed).toBe("live_generated_preview");
    expect(out.plainText.length).toBeGreaterThan(thinAdt.length + 100);
    expect(premiumRenderCorpusContainsSignals(out.plainText).contains_commission).toBe(true);
    expect(out.plainText.trim()).toBe(rebuilt.trim());
  });
});
