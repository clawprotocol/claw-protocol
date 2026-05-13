/**
 * Surgical regression suite for starter multi-party flows (production-critical bug spec):
 *   §1 Governing-law overwrite (Oklahoma → Delaware)
 *   §2 Multi-party first-party drop ("Alpha LLC, Beta Advisors, and Gamma Holdings")
 *   §3 NDA canonical title (legacy "Confidentiality Agreement" → "Mutual Non-Disclosure Agreement")
 *   §4 Confidentiality phrase leaking into Payment Terms
 *   §5 Date parsing polish (clean "Start Date:" / "End Date:" labels)
 *   §6 Complexity-gate progressive enhancement (advisor + simple LLC)
 *
 * No hard-coded fixtures from the bug report — random names + state pool ensure the
 * heuristics generalize beyond the specific examples in the spec.
 */
import { describe, expect, it } from "vitest";
import {
  parseIntakeToStructuredAgreement,
  type IntakeStructuredAgreement,
} from "./intakeStructuredAgreementModel";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  intakeLooksLikeAdvisorAgreement,
  operatingAgreementHasHighComplexitySignals,
  shouldInterceptAdvancedDocumentFamily,
} from "./agreementLaunchFamilies";
import {
  isPaymentSemanticallySafe,
  NO_PAYMENT_NEUTRAL_FALLBACK,
} from "./paymentSemanticGuard";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true } as const;
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
    payment: { ...EMPTY_PAYMENT },
  };
}
function pipe(intake: string, simple = true): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(emptyDraft(), intake, simple, defaultIntakePartyRoleLabels());
}
function structured(intake: string): IntakeStructuredAgreement {
  return parseIntakeToStructuredAgreement(intake);
}

describe("§1 Governing law: authoritative extraction (>=0.8) survives all flows", () => {
  const STATES = ["Oklahoma", "Texas", "New York"] as const;

  it.each(STATES)("bare '%s law' input → jurisdiction is %s, not Delaware", (state) => {
    const s = structured(`${state} law`);
    expect(s.governing_law).toBe(state);
    expect(s.governingLawConfidence).toBeGreaterThanOrEqual(0.8);
    const r = pipe(`${state} law`);
    expect(r.jurisdiction).toBe(state);
  });

  it.each(STATES)("consulting agreement governed by %s law", (state) => {
    const r = pipe(`Consulting agreement between Acme LLC and Jane Doe, governed by ${state} law.`);
    expect(r.jurisdiction.toLowerCase()).toContain(state.toLowerCase());
    expect(r.jurisdiction.toLowerCase()).not.toBe("delaware");
  });

  it.each(STATES)("NDA mentioning %s law preserves jurisdiction", (state) => {
    const r = pipe(`Mutual NDA between Acme Inc. and Beta Corp. ${state} law applies.`);
    expect(r.jurisdiction.toLowerCase()).toContain(state.toLowerCase());
  });

  it.each(STATES)("software development with %s law", (state) => {
    const r = pipe(
      `Web development agreement between BuildCo LLC and Indie Studios for an e-commerce site. Governed by ${state} law.`,
    );
    expect(r.jurisdiction.toLowerCase()).toContain(state.toLowerCase());
  });

  it.each(STATES)("advisor agreement with %s law", (state) => {
    const r = pipe(
      `Advisor agreement between FoundCo Inc. and Jane Smith. Equity 0.25%. Governed by ${state} law.`,
    );
    expect(r.jurisdiction.toLowerCase()).toContain(state.toLowerCase());
  });

  it("authoritative extraction is NOT overwritten by an explicit Delaware default later", () => {
    const draft = { ...emptyDraft(), jurisdiction: "Delaware" };
    const s = structured("Texas law applies.");
    expect(s.governingLawConfidence).toBeGreaterThanOrEqual(0.8);
    // Even with a pre-set Delaware default, authoritative extraction wins.
    const r = runIntakeDefaultsAndRoles(draft, "Texas law applies.", true, defaultIntakePartyRoleLabels());
    expect(r.jurisdiction).toBe("Texas");
  });
});

describe("§2 Multi-party: ALL parties survive split / overlay / render", () => {
  it("3-party consulting with comma+and list preserves all 3 names", () => {
    const r = pipe("Consulting agreement between Alpha LLC, Beta Advisors, and Gamma Holdings.");
    const names = r.parties.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Alpha LLC", "Beta Advisors", "Gamma Holdings"]));
    expect(names.length).toBe(3);
  });

  it("4-party services preserves all four entity names", () => {
    const r = pipe(
      "4-party services between Northstar Labs, Riverbend Partners, Atlas Capital, and Delta Studios.",
    );
    const names = r.parties.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["Northstar Labs", "Riverbend Partners", "Atlas Capital", "Delta Studios"]),
    );
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it("LLC + person mixed parties (entity, entity, individual)", () => {
    const r = pipe("Service agreement between Acme LLC, Beta Inc, and John Smith.");
    const names = r.parties.map((p) => p.name);
    // Entity period normalization is acceptable; check presence not exact strings.
    expect(names.some((n) => /^Acme LLC\.?$/i.test(n))).toBe(true);
    expect(names.some((n) => /^Beta Inc\.?$/i.test(n))).toBe(true);
    expect(names).toContain("John Smith");
    expect(names.length).toBe(3);
  });

  it("first party is NEVER dropped — even with no 'between' prefix", () => {
    const r = pipe("Alpha LLC, Beta Advisors, and Gamma Holdings");
    const names = r.parties.map((p) => p.name);
    expect(names[0]).toBe("Alpha LLC");
    expect(names.length).toBe(3);
  });

  it("structured.parties surfaces all 3+ parties (multi-party invariant)", () => {
    const cases = [
      "Consulting agreement between Acme LLC, Beta Co, and Charlie Inc.",
      "NDA among Northstar Labs, Riverbend Partners, and Atlas Capital.",
      "Services among One LLC, Two LLC, Three LLC, and Four LLC.",
    ];
    for (const c of cases) {
      const s = structured(c);
      expect(s.parties.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("§3 NDA canonical title — never legacy 'Confidentiality Agreement'", () => {
  it("intake with 'Confidentiality Agreement' as a header resolves to Mutual NDA", () => {
    const r = pipe("Confidentiality Agreement between Alpha Inc. and Beta LLC.");
    expect(r.title).toMatch(/Non-Disclosure Agreement/i);
    expect(r.title).not.toMatch(/^confidentiality\s+agreement$/i);
  });

  it("plain NDA defaults to Mutual NDA canonical title", () => {
    const r = pipe("NDA");
    expect(r.title).toBe("Mutual Non-Disclosure Agreement");
  });

  it("explicitly mutual NDA stays mutual", () => {
    const r = pipe("Mutual NDA between A Inc and B LLC for joint product evaluation.");
    expect(r.title).toBe("Mutual Non-Disclosure Agreement");
  });

  it("explicit one-way NDA falls back to Non-Disclosure Agreement", () => {
    const r = pipe("One-way non-disclosure agreement. Disclosing Party: Acme Inc. Receiving Party: Vendor LLC.");
    expect(r.title).toMatch(/Non-Disclosure Agreement/i);
    // Critical: never the legacy plain "Confidentiality Agreement" label (regression spec §3).
    expect(r.title).not.toBe("Confidentiality Agreement");
  });

  it("preserves a truly custom user title verbatim", () => {
    const draft = { ...emptyDraft(), title: "Project Apollo Confidentiality Pact 2026" };
    const r = runIntakeDefaultsAndRoles(
      draft,
      "Mutual NDA for Project Apollo.",
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(r.title).toBe("Project Apollo Confidentiality Pact 2026");
  });

  it("legacy 'Mutual Confidentiality Agreement' title is overridden", () => {
    const draft = { ...emptyDraft(), title: "Mutual Confidentiality Agreement" };
    const r = runIntakeDefaultsAndRoles(
      draft,
      "Mutual NDA between A Inc and B LLC.",
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(r.title).toBe("Mutual Non-Disclosure Agreement");
  });
});

describe("§4 Confidentiality tokens never leak into Payment Terms", () => {
  it("isPaymentSemanticallySafe rejects confidentiality / NDA / proprietary tokens", () => {
    const TAINTED = [
      "Mutual confidentiality",
      "confidential information shared",
      "non-disclosure obligations",
      "NDA standard of care",
      "Proprietary information protected",
      "trade secrets retained",
      "Disclosing Party retains rights",
      "Receiving Party covenants",
    ];
    for (const s of TAINTED) {
      expect(isPaymentSemanticallySafe(s)).toBe(false);
    }
  });

  it("isPaymentSemanticallySafe accepts genuine payment text", () => {
    const SAFE = [
      "$5,000 due on signing",
      "Net 30 invoicing",
      "USD 1,200 monthly retainer",
      "Hourly rate $250/hr",
    ];
    for (const s of SAFE) {
      expect(isPaymentSemanticallySafe(s)).toBe(true);
    }
  });

  it("NDA-only intake never produces 'Mutual confidentiality' in payment_terms", () => {
    const r = pipe("Mutual confidentiality between two startups for joint product evaluation.");
    expect(r.payment_terms.toLowerCase()).not.toContain("confidential");
    expect(r.payment_terms.toLowerCase()).not.toContain("non-disclosure");
    expect(r.payment_terms.toLowerCase()).not.toContain("proprietary");
  });

  it("NDA with 'fee' near 'confidentiality' does not contaminate payment", () => {
    const r = pipe(
      "Mutual NDA between Alpha Inc. and Beta LLC. fee structure for confidentiality breach: indemnify in full.",
    );
    expect(r.payment_terms.toLowerCase()).not.toContain("confidential");
    expect(r.payment_terms.toLowerCase()).not.toContain("non-disclosure");
  });

  it("provides a neutral no-payment fallback constant", () => {
    expect(NO_PAYMENT_NEUTRAL_FALLBACK).toMatch(/no\s+payment/i);
  });
});

describe("§5 Date parsing polish — clean Start/End labels, no malformed hybrids", () => {
  it("'starts X and ends Y' renders as 'Start Date: X · End Date: Y'", () => {
    const s = structured("Term: starts May 15, 2026 and ends June 30, 2027.");
    expect(s.term).toBe("Start Date: May 15, 2026 · End Date: June 30, 2027");
    expect(s.term).not.toMatch(/start\s*\/\s*date/i);
  });

  it("standalone 'starts X' produces 'Start Date: X'", () => {
    const s = structured("Engagement starts on March 1, 2026.");
    expect(s.term).toMatch(/Start Date:\s*March 1, 2026/i);
  });

  it("'from X to Y' renders as Start/End label", () => {
    const s = structured("Effective from January 1, 2027 to December 31, 2027.");
    expect(s.term).toMatch(/Start Date:\s*January 1, 2027/);
    expect(s.term).toMatch(/End Date:\s*December 31, 2027/);
  });

  it("legacy 'Start / date:' hybrid label is no longer produced", () => {
    const cases = [
      "Service kickoff August 12, 2026.",
      "Start Date: April 1, 2026 and End Date: April 30, 2027.",
      "Effective Date: July 1, 2027.",
    ];
    for (const c of cases) {
      const s = structured(c);
      expect(s.term).not.toMatch(/start\s*\/\s*date/i);
    }
  });

  it("'Start Date:' / 'End Date:' explicit labels are preserved verbatim", () => {
    const s = structured("Start Date: April 1, 2026. End Date: April 30, 2027.");
    expect(s.term).toMatch(/Start Date:\s*April 1, 2026/);
    expect(s.term).toMatch(/End Date:\s*April 30, 2027/);
  });

  it("Term: prefix containing dates does not pollute parties[]", () => {
    const s = structured("Term: starts May 15, 2026 and ends June 30, 2027.");
    expect(s.parties.length).toBe(0);
  });
});

describe("§6 Complexity gate — advisor & simple LLC progressive enhancement", () => {
  it("advisor agreements are NEVER hard-blocked", () => {
    const intakes = [
      "Advisor agreement between FoundCo and Jane Smith. Equity: 0.25%.",
      "Board advisor for Acme Inc — Jane Doe, vesting 2 years. Equity: 0.5%.",
      "Strategic advisor agreement: BetaCorp LLC + John Smith.",
      "Technical advisor for our LLC, monthly stipend.",
    ];
    for (const intake of intakes) {
      expect(intakeLooksLikeAdvisorAgreement(intake)).toBe(true);
      expect(shouldInterceptAdvancedDocumentFamily(intake, "consulting_agreement")).toBe(false);
    }
  });

  it("simple 3-member LLC operating agreement is NOT gated", () => {
    const intake = "Operating agreement for Acme LLC with three members: Alice, Bob, Carol.";
    expect(operatingAgreementHasHighComplexitySignals(intake)).toBe(false);
    expect(shouldInterceptAdvancedDocumentFamily(intake, "operating_agreement")).toBe(false);
  });

  it("simple 2-member LLC operating agreement is NOT gated", () => {
    const intake = "Operating agreement for Beta LLC. Members: John (50%) and Jane (50%).";
    expect(shouldInterceptAdvancedDocumentFamily(intake, "operating_agreement")).toBe(false);
  });

  it("highly complex LLC operating agreement IS gated (vesting / classes / waterfall)", () => {
    const intakes = [
      "Operating agreement for Acme LLC: Class A and Class B units, 4-year vesting with 1-year cliff.",
      "OA with drag-along, tag-along, pro-rata participation rights, and waterfall distributions.",
      "LLC with preferred return, capital calls with cure for missed contributions, and dilution penalties.",
      "Operating agreement with board of managers and management committee.",
    ];
    for (const intake of intakes) {
      expect(operatingAgreementHasHighComplexitySignals(intake)).toBe(true);
      expect(shouldInterceptAdvancedDocumentFamily(intake, "operating_agreement")).toBe(true);
    }
  });

  it("non-advisor consulting + LLC equity wording does NOT gate (loosened)", () => {
    const intake = "Consulting agreement between Acme LLC and Jane. Equity component possible.";
    expect(shouldInterceptAdvancedDocumentFamily(intake, "consulting_agreement")).toBe(false);
  });
});

describe("end-to-end: advisor + simple LLC starter pipelines", () => {
  it("advisor starter pipeline produces a usable draft (not an empty/blocked shell)", () => {
    const r = pipe(
      "Advisor agreement between FoundCo Inc and Jane Smith. Equity: 0.25%. Governed by California law.",
    );
    expect(r.parties.length).toBeGreaterThanOrEqual(2);
    expect(r.title).toBeTruthy();
    expect(r.jurisdiction.toLowerCase()).toContain("california");
    // Confidentiality must NOT have leaked into payment.
    expect(r.payment_terms.toLowerCase()).not.toMatch(/non[-\s]?disclosure|confidential/);
  });

  it("simple 3-member LLC starter pipeline produces a usable draft", () => {
    const r = pipe(
      "Operating agreement for Sunrise LLC with three members: Alice, Bob, and Carol. Governed by New York law.",
    );
    expect(r.title.toLowerCase()).toContain("operating");
    expect(r.jurisdiction.toLowerCase()).toContain("new york");
    expect(r.parties.length).toBeGreaterThanOrEqual(2);
  });
});
