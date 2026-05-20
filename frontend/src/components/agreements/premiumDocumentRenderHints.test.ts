import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import { computePremiumDocumentRenderHints } from "./premiumDocumentRenderHints";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

describe("computePremiumDocumentRenderHints", () => {
  it("flags thin dollar-only payment as needing final numbers", () => {
    const d: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Texas",
      parties: [
        { name: "Acme LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "$5,000 flat.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const h = computePremiumDocumentRenderHints(d, "");
    expect(h.paymentNeedsFinalNumbers).toBe(true);
    expect(h.partiesNeedLegalNames).toBe(false);
  });

  it("flags placeholder parties", () => {
    const d: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Texas",
      parties: [
        { name: "Party A", role: "party" },
        { name: "Party B", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Net 30 with invoicing, milestones, and tax documentation attached.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const h = computePremiumDocumentRenderHints(d, "");
    expect(h.partiesNeedLegalNames).toBe(true);
    expect(h.paymentNeedsFinalNumbers).toBe(false);
  });

  it("flags governing law placeholder in draft or document", () => {
    const d: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: PREMIUM_JURISDICTION_PLACEHOLDER,
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Net 30.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    expect(computePremiumDocumentRenderHints(d, "").jurisdictionNeedsSelection).toBe(true);
    expect(computePremiumDocumentRenderHints(d, `Law\n\n${PREMIUM_JURISDICTION_PLACEHOLDER}`).jurisdictionNeedsSelection).toBe(
      true,
    );
  });

  it("includes situation framing from intake", () => {
    const d: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Texas",
      parties: [
        { name: "Acme LLC", role: "party" },
        { name: "Beta LLC", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "Net 30.",
      duration: "12 months",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const h = computePremiumDocumentRenderHints(d, "", "B2B SaaS subscription for HR teams");
    expect(h.executiveFramingLine).toMatch(/Software/i);
  });
});
