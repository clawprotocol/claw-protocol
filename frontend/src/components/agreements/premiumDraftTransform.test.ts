import { describe, expect, it } from "vitest";
import { FULL_DRAFT_EXPANSION_MARKER } from "./fullDraftUpgradeEnrich";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  detectPremiumCommercialSignals,
  injectCoreClausesConservative,
  isLikelyCategoryOrTradeLabel,
  looksClauseGradePremiumPurpose,
  PREMIUM_JURISDICTION_PLACEHOLDER,
  resolvePremiumJurisdiction,
  stripFullDraftExpansionBlock,
  synthesizePremiumScopeAndOperativeFields,
} from "./premiumDraftTransform";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function base(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "New York",
    parties: [
      { name: "Acme LLC", role: "party" },
      { name: "Beta LLC", role: "party" },
    ],
    purpose: "Do work.",
    payment_terms: "Monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    agreement_family: "services_agreement",
    ...over,
  };
}

describe("stripFullDraftExpansionBlock", () => {
  it("removes marker and trailing expansion pack", () => {
    const s = `User notes here\n\n${FULL_DRAFT_EXPANSION_MARKER}\nExpanded provisions…`;
    expect(stripFullDraftExpansionBlock(s)).toBe("User notes here");
  });
});

describe("isLikelyCategoryOrTradeLabel", () => {
  it("flags menu-style scope labels", () => {
    expect(isLikelyCategoryOrTradeLabel("Cleaning services")).toBe(true);
    expect(isLikelyCategoryOrTradeLabel("Fitness Niche")).toBe(true);
    expect(isLikelyCategoryOrTradeLabel("")).toBe(true);
  });

  it("allows concrete deal descriptions", () => {
    expect(isLikelyCategoryOrTradeLabel("Weekly lawn care for 123 Oak St through December")).toBe(false);
    expect(isLikelyCategoryOrTradeLabel("California")).toBe(false);
  });
});

describe("resolvePremiumJurisdiction", () => {
  it("returns placeholder when parsed jurisdiction is absent from intake", () => {
    const intake = "Between Acme LLC and Beta LLC for weekly lawn maintenance in Dallas.";
    const d = base({ jurisdiction: "Delaware" });
    expect(resolvePremiumJurisdiction(d, intake)).toBe(PREMIUM_JURISDICTION_PLACEHOLDER);
  });

  it("accepts jurisdiction when the same state appears in intake", () => {
    const intake = "Services in California; governing law of California applies.";
    expect(resolvePremiumJurisdiction(base({ jurisdiction: "California" }), intake)).toContain("California");
  });
});

const MARKETING_AGENCY_ECOMMERCE_PROMPT =
  "My e-commerce brand wants to hire a marketing agency that will run Meta/TikTok ads and email flows. Need spend approval limits, ownership of ad accounts and pixel data, no hidden subcontractors, performance reporting, confidentiality, FTC compliance, chargeback handling, cancellation notice, and no using our creatives for competitors.";

describe("injectCoreClausesConservative — dispute / signal gating", () => {
  it("does not inject generic dispute-resolution from governing-law-only intake", () => {
    const weakDraft = base({
      purpose: "Consulting support.",
      payment_terms: "Monthly retainer.",
      additional_terms: null,
    });
    const intake =
      "Acme LLC hires Beta LLC for marketing consulting. Governing law of New York applies to interpretation.";
    const out = injectCoreClausesConservative(weakDraft, intake);
    expect(out.additional_terms ?? "").not.toMatch(
      /Dispute resolution: The Parties will attempt good-faith negotiation before pursuing formal remedies/i,
    );
  });
});

describe("detectPremiumCommercialSignals", () => {
  it("does not treat governing law alone as dispute/arbitration signal", () => {
    const s = detectPremiumCommercialSignals("Agreement governed by California law. Parties in Texas.");
    expect(s.disputeArbitration).toBe(false);
  });

  it("treats explicit arbitration as dispute signal", () => {
    const s = detectPremiumCommercialSignals("Any dispute shall be resolved by binding arbitration under AAA rules.");
    expect(s.disputeArbitration).toBe(true);
  });

  it("does not treat bare 'ip' as ownership pack trigger", () => {
    const s = detectPremiumCommercialSignals("We need help with ip strategy and branding only.");
    expect(s.ownershipData).toBe(false);
  });
});

describe("injectCoreClausesConservative — marketing agency / paid media pack", () => {
  it("injects agency-specific safeguards and materially exceeds free baseline (no invented economics)", () => {
    const weakDraft = base({
      purpose: "Marketing services for the brand.",
      payment_terms: "Fees and payment schedule to be agreed between the parties.",
      additional_terms: null,
    });
    const freeBaseline = buildAgreementPreviewText(weakDraft, { starterPreview: true });
    const injected = injectCoreClausesConservative(weakDraft, MARKETING_AGENCY_ECOMMERCE_PROMPT);
    const premiumBody = buildAgreementPreviewText(injected, {
      starterPreview: false,
      premiumDeliverablePreview: true,
    });
    expect(injected.additional_terms ?? "").toContain("Marketing agency / paid media safeguards");
    expect(premiumBody).toMatch(/\bad\s+accounts?\b.*\bpixels?\b|\bpixels?\b.*\bad\s+accounts?\b/i);
    expect(premiumBody).toMatch(/subcontract/i);
    expect(premiumBody).toMatch(/reporting|performance/i);
    expect(premiumBody).toMatch(/\bftc\b|consumer-protection/i);
    expect(premiumBody).toMatch(/competitors?|competing|non-reuse/i);
    expect(premiumBody).toMatch(/chargeback/i);
    expect(premiumBody.length).toBeGreaterThan(freeBaseline.length + 400);
    expect(premiumBody).not.toEqual(freeBaseline);
  });
});

describe("looksClauseGradePremiumPurpose", () => {
  it("detects multi-paragraph premium-style operative text", () => {
    const p =
      "The Parties shall cooperate on paid media campaigns. The Agency shall obtain written approval before increasing spend thresholds. " +
      "The Client shall retain ownership of ad accounts and pixel data. Either Party may terminate for material breach upon written notice.";
    expect(looksClauseGradePremiumPurpose(p)).toBe(true);
  });
});

describe("synthesizePremiumScopeAndOperativeFields", () => {
  it("replaces wall-of-text purpose that echoes intake", () => {
    const blob = "B".repeat(500);
    const intake = `Between Acme LLC and Beta LLC.\nScope: weekly cleaning.\n\n${blob}`;
    const d = base({
      purpose: blob,
      additional_terms: `prior\n\n${FULL_DRAFT_EXPANSION_MARKER}\n• Boilerplate`,
    });
    const out = synthesizePremiumScopeAndOperativeFields(d, intake);
    expect(out.purpose.length).toBeLessThan(900);
    expect(out.purpose).not.toContain("BBBB");
    expect(out.additional_terms ?? "").not.toContain(FULL_DRAFT_EXPANSION_MARKER);
    expect(out.purpose.toLowerCase()).toMatch(/operative|services relationship|commercial scope/);
  });

  it("keeps long premium clause purpose that does not echo raw intake", () => {
    const intake =
      "Between Acme LLC and Beta LLC for marketing support. Weekly reporting required. Delaware law.";
    const longPurpose =
      "Services relationship: the Agency shall manage paid social placements subject to written spend caps. " +
      "The Client shall retain ownership of ad accounts, pixels, audiences, and performance exports. " +
      "The Agency shall not engage undisclosed subcontractors for material deliverables. " +
      "The Parties shall comply with applicable advertising standards including FTC guidance on claims and endorsements. " +
      "Either Party may terminate this engagement on thirty days written notice, subject to payment for work performed through the effective date.";
    const d = base({
      purpose: longPurpose,
      additional_terms: null,
    });
    const out = synthesizePremiumScopeAndOperativeFields(d, intake);
    expect(out.purpose).toContain("Agency shall");
    expect(out.purpose).toContain("FTC");
    expect(out.purpose.length).toBeGreaterThan(320);
  });
});
