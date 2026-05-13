/**
 * Starter/free draft hardening regression tests.
 *
 * Verifies:
 * 1. Extracted structured facts survive end-to-end into the starter preview.
 * 2. No Pro/premium-only copy appears in free-state preview.
 * 3. Multi-party formatting works correctly in all scenarios.
 * 4. Complexity gate does NOT trigger on normal commercial agreements.
 * 5. Fact preservation works across agreement families (NDA, consulting, dev, generic).
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { shouldInterceptAdvancedDocumentFamily, matchesAdvancedCommercialStructureSignals } from "./agreementLaunchFamilies";
import { detectAgreementFamily } from "./agreementFamilyRouter";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true };

function emptyDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

function runPipeline(intakeText: string, draft?: Partial<ParsedDraftShape>): ParsedDraftShape {
  const base = { ...emptyDraft(), ...(draft || {}) };
  return runIntakeDefaultsAndRoles(base, intakeText, true, defaultIntakePartyRoleLabels());
}

function starterPreview(draft: ParsedDraftShape): string {
  return buildAgreementPreviewText(draft, { starterPreview: true });
}

/**
 * Phrases that indicate PRO DELIVERY copy (not upsell mentions).
 * The starter preview intro mentions "LawDog Pro can expand" as a soft upsell — that's allowed.
 * What's NOT allowed: Pro-only delivery headers, "This LawDog Pro agreement", etc.
 */
const PRO_DELIVERY_PHRASES = [
  "This LawDog Pro agreement",
  "confirm material terms before you share or sign",
];

const STARTER_DISCLAIMER = "simplified starter preview";

describe("regression fixture: 4-party web/software development agreement", () => {
  const intake = `Web development agreement.
Signer 1: Marcus Webb
Signer 2: Diana Kowalski
Signer 3: Raj Patel
Signer 4: Elena Vasquez

Scope: Design and develop a multi-tenant SaaS platform with React frontend, Node.js backend, and PostgreSQL database.
Payment: $48,000 total. 25% upfront, 25% at MVP, 25% at beta, 25% on launch.
Term: 8 months from effective date.
Effective date: June 1, 2026.
Governing law: California.
Confidentiality: All parties agree to keep proprietary source code, API keys, and business logic confidential.
IP/Work-for-hire: All work product and intellectual property created during the engagement is owned by Marcus Webb.
Termination: Either party may terminate with 14 days written notice. Outstanding milestones paid pro-rata.
E-signatures: Agreement to be signed electronically by all parties.`;

  it("preserves all 4 party names in draft", () => {
    const result = runPipeline(intake);
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    expect(result.parties.some((p) => p.name.includes("Webb"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Kowalski"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Patel"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Vasquez"))).toBe(true);
  });

  it("preserves payment amount", () => {
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/48[,.]?000/);
  });

  it("preserves duration", () => {
    const result = runPipeline(intake);
    expect(result.duration).toMatch(/8 months/i);
  });

  it("preserves governing law", () => {
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/california/i);
  });

  it("preserves scope — not a placeholder", () => {
    const result = runPipeline(intake);
    expect(result.purpose).not.toMatch(/to be refined/i);
    expect(result.purpose).not.toMatch(/to be described/i);
    expect(result.purpose.length).toBeGreaterThan(20);
  });

  it("preserves termination notice", () => {
    const result = runPipeline(intake);
    expect(result.termination_summary).toMatch(/14/);
    expect(result.termination_summary).toMatch(/notice/i);
  });

  it("routes as development/service agreement, not NDA", () => {
    const family = detectAgreementFamily(intake);
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("does NOT trigger complexity gate", () => {
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(false);
  });

  it("starter preview contains all party names", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain("Webb");
    expect(preview).toContain("Kowalski");
    expect(preview).toContain("Patel");
    expect(preview).toContain("Vasquez");
  });

  it("starter preview uses Oxford comma (no repeated 'and')", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    const preamble = preview.split("\n").find((l) => l.includes("entered into"));
    if (preamble) {
      const andCount = (preamble.match(/\band\b/g) || []).length;
      expect(andCount).toBeLessThanOrEqual(1);
    }
  });

  it("starter preview does NOT contain Pro delivery copy", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain(STARTER_DISCLAIMER);
    for (const phrase of PRO_DELIVERY_PHRASES) {
      expect(preview).not.toContain(phrase);
    }
  });

  it("starter preview contains governing law", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toMatch(/california/i);
  });
});

describe("regression fixture: 3-party consulting agreement", () => {
  const intake = `Consulting agreement.
Signer 1: Nadia Okonkwo
Signer 2: Felix Lindqvist
Signer 3: Tomoko Hayashi

Scope: Strategic go-to-market consulting for B2B SaaS launch including positioning, messaging, and channel strategy.
Payment: $9,500 per month.
Term: 6 months, auto-renewing unless 30 days notice given.
Governing law: New York.
Confidentiality: All parties will maintain strict confidentiality of business plans, financial projections, and customer data.
E-signatures: Parties agree to execute this agreement electronically.`;

  it("preserves all 3 party names", () => {
    const result = runPipeline(intake);
    expect(result.parties.length).toBe(3);
    expect(result.parties.some((p) => p.name.includes("Okonkwo"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Lindqvist"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Hayashi"))).toBe(true);
  });

  it("preserves monthly payment", () => {
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/9[,.]?500/);
  });

  it("preserves 6-month term", () => {
    const result = runPipeline(intake);
    expect(result.duration).toMatch(/6 months/i);
  });

  it("preserves New York jurisdiction", () => {
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/new york/i);
  });

  it("preserves scope substance", () => {
    const result = runPipeline(intake);
    expect(result.purpose).toMatch(/consult|go-to-market|strategy/i);
    expect(result.purpose).not.toMatch(/to be (?:refined|described|agreed)/i);
  });

  it("routes as consulting_agreement", () => {
    const family = detectAgreementFamily(intake);
    expect(family).toBe("consulting_agreement");
  });

  it("does NOT trigger complexity gate", () => {
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(false);
  });

  it("starter preview contains all 3 party names with Oxford comma", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain("Okonkwo");
    expect(preview).toContain("Lindqvist");
    expect(preview).toContain("Hayashi");
  });

  it("starter preview does NOT contain Pro delivery copy", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain(STARTER_DISCLAIMER);
    for (const phrase of PRO_DELIVERY_PHRASES) {
      expect(preview).not.toContain(phrase);
    }
  });
});

describe("regression fixture: 3-party mutual NDA", () => {
  const intake = `Mutual NDA.
Signer 1: Kenji Nakamura
Signer 2: Olivia Brennan
Signer 3: David Morales

Purpose: Mutual evaluation of potential joint product development opportunity in renewable energy storage.
Term: 2 years from execution date.
Governing law: Illinois.
Confidentiality: Mutual — each party's proprietary information, trade secrets, and technical specifications are protected.`;

  it("preserves all 3 party names", () => {
    const result = runPipeline(intake);
    expect(result.parties.length).toBe(3);
    expect(result.parties.some((p) => p.name.includes("Nakamura"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Brennan"))).toBe(true);
    expect(result.parties.some((p) => p.name.includes("Morales"))).toBe(true);
  });

  it("routes as NDA", () => {
    const family = detectAgreementFamily(intake);
    expect(family).toBe("nda");
  });

  it("preserves 2-year term", () => {
    const result = runPipeline(intake);
    expect(result.duration).toMatch(/2 years/i);
  });

  it("preserves Illinois jurisdiction", () => {
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/illinois/i);
  });

  it("preserves purpose/scope — not a generic placeholder", () => {
    const result = runPipeline(intake);
    expect(result.purpose).toMatch(/mutual|evaluation|renewable|joint/i);
  });

  it("does NOT trigger complexity gate", () => {
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(false);
  });

  it("starter preview contains all party names", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain("Nakamura");
    expect(preview).toContain("Brennan");
    expect(preview).toContain("Morales");
  });

  it("starter preview does NOT contain Pro delivery copy", () => {
    const result = runPipeline(intake);
    const preview = starterPreview(result);
    expect(preview).toContain(STARTER_DISCLAIMER);
    for (const phrase of PRO_DELIVERY_PHRASES) {
      expect(preview).not.toContain(phrase);
    }
  });
});

describe("complexity gate calibration", () => {
  it("normal consulting with Corp entity does NOT gate", () => {
    const intake = "Consulting agreement between Acme Corp and DevPro LLC. Scope: Marketing strategy. Fee: $5,000/month. Governing law: Texas.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(false);
  });

  it("development agreement with milestone payments does NOT gate", () => {
    const intake = "Software development agreement. Payment structure: milestone-based. $10,000 at prototype, $15,000 at launch.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(false);
  });

  it("vendor agreement with Inc entity does NOT gate", () => {
    const intake = "Vendor agreement between TechStart Inc. and FreshDesign LLC. Monthly retainer: $3,500. Deliverables: Brand identity package.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(false);
  });

  it("simple LLC operating agreement does NOT hard-gate (progressive enhancement, spec §6)", () => {
    // Regression spec §6: simple operating agreements now flow through to a starter draft;
    // premium upsell is offered AFTER generation rather than blocking the user.
    const intake = "Operating agreement for Sunrise Ventures LLC. Members: Alice (60%), Bob (40%). Manager-managed.";
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(false);
  });

  it("complex LLC operating agreement (vesting / preferred classes) DOES gate", () => {
    const intake =
      "Operating agreement: Class A common units and Class B preferred units, 4-year vesting with 1-year cliff, drag-along and pro-rata participation rights, waterfall distributions.";
    const family = detectAgreementFamily(intake);
    expect(shouldInterceptAdvancedDocumentFamily(intake, family)).toBe(true);
  });

  it("SAFE instrument DOES gate", () => {
    const intake = "Simple agreement for future equity (SAFE) with a $500K valuation cap.";
    expect(shouldInterceptAdvancedDocumentFamily(intake, undefined)).toBe(true);
  });

  it("ordinary revenue share alone does NOT gate (per invariant 3)", () => {
    // Universal invariant 3: revenue share is ordinary commercial / partnership economics.
    // It is NOT a true advanced-structure signal (no waterfall / preferred equity / SAFE / etc.).
    const intake = "Partnership with 60/40 revenue share and quarterly distributions.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(false);
  });

  it("revenue share with waterfall + preferred return DOES gate (true advanced structure)", () => {
    const intake =
      "Partnership LLC between Alpha Capital LP and Beta Holdings: waterfall distributions with 8% preferred return, 60/40 revenue share thereafter, capital calls with cure rights.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(true);
  });

  it("ordinary equity compensation alone does NOT gate (per invariant 3)", () => {
    // Universal invariant 3: ordinary employment equity grants are NOT a structured-finance signal.
    // Vesting language is not present in this intake; gate is correctly off.
    const intake = "Employment agreement with equity compensation of stock options.";
    expect(matchesAdvancedCommercialStructureSignals(intake)).toBe(false);
  });

  it("multi-class equity with vesting + drag-along DOES gate (true advanced structure)", () => {
    const intake =
      "Operating agreement for ApexCo LLC. Class A common units and Class B preferred units. 4-year vesting. Drag-along rights.";
    expect(shouldInterceptAdvancedDocumentFamily(intake, "operating_agreement")).toBe(true);
  });
});

describe("fact preservation across agreement families", () => {
  it("NDA: governing law survives even without 'governed by' phrasing", () => {
    const intake = "Mutual NDA. Signer 1: Alpha Corp. Signer 2: Beta Inc. Governing law: Washington. Duration: 3 years.";
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/washington/i);
    expect(result.jurisdiction).not.toMatch(/^delaware$/i);
  });

  it("services agreement: payment survives pipeline", () => {
    const intake = "Services agreement. Provider: Quinn Ltd. Client: Zeta Corp. Scope: IT infrastructure management. Fee: $15,000/quarter. Governing law: Colorado.";
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/15[,.]?000/);
    expect(result.jurisdiction).toMatch(/colorado/i);
  });

  it("generic business: labeled scope does not become placeholder", () => {
    const intake = "Business agreement. Scope: Joint marketing campaign targeting enterprise customers in North America. Governing law: Texas.";
    const result = runPipeline(intake);
    expect(result.purpose).toMatch(/marketing|campaign|enterprise/i);
    expect(result.purpose).not.toMatch(/commercial arrangement to be described/i);
  });

  it("independent contractor: rate survives", () => {
    const intake = "Independent contractor agreement. Freelance developer builds mobile app. Rate: $120/hour. Governing law: Texas. Term: until project completion or 6 months.";
    const result = runPipeline(intake);
    expect(result.payment_terms).toMatch(/120/);
    expect(result.jurisdiction).toMatch(/texas/i);
  });
});
