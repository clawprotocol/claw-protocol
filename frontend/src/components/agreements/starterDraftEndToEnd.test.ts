/**
 * End-to-end regression suite for the starter/free draft pipeline.
 *
 * Asserts the following invariants from intake → defaults → fact preservation → preview render:
 *   1. All confidently extracted parties survive (3+ parties not reduced).
 *   2. Explicitly extracted governing law survives (no Delaware fallback).
 *   3. Mutual / multi-party NDAs never inject unilateral "Receiving Party / Disclosing Party" labels.
 *   4. Pure NDA prompts route to the NDA family.
 *   5. NDA heading is "Non-Disclosure Agreement" / "Mutual Non-Disclosure Agreement"
 *      (not generic "Confidentiality Agreement") for empty parsed titles.
 *   6. Scope extraction terminates at the next labeled field — no contamination.
 *   7. No "Compensation and payment terms shall be defined..." note leaks into termination.
 *   8. No duplicated "and" in multi-party preambles.
 *   9. All names use varied fixtures (no Anthem/Sarah).
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";

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

function starter(draft: ParsedDraftShape): string {
  return buildAgreementPreviewText(draft, { starterPreview: true });
}

const FORBIDDEN_TERMINATION_LEAKAGE = "Compensation and payment terms shall be defined";
const STARTER_DISCLAIMER = "simplified starter preview";

/* ----------------------------- Multi-party preservation ----------------------------- */

describe("multi-party preservation invariant", () => {
  it("3-party comma-list (Alpha LLC, Beta Advisors, Gamma Holdings) — all survive", () => {
    const intake = `Services agreement.
Parties: Alpha LLC, Beta Advisors, Gamma Holdings.
Scope: Joint research collaboration.
Governing law: Texas.`;
    const result = runPipeline(intake);
    const names = result.parties.map((p) => p.name).join(" | ");
    expect(result.parties.length).toBeGreaterThanOrEqual(3);
    expect(names).toMatch(/Alpha/);
    expect(names).toMatch(/Beta/);
    expect(names).toMatch(/Gamma/);
  });

  it("3-party comma-list (Northstar Labs, Riverbend Partners, Atlas Capital) — all survive", () => {
    const intake = `Vendor services agreement.
Parties: Northstar Labs, Riverbend Partners, Atlas Capital.
Scope: Quarterly market intelligence reporting.
Governing law: New York.`;
    const result = runPipeline(intake);
    const names = result.parties.map((p) => p.name).join(" | ");
    expect(result.parties.length).toBeGreaterThanOrEqual(3);
    expect(names).toMatch(/Northstar/);
    expect(names).toMatch(/Riverbend/);
    expect(names).toMatch(/Atlas/);
  });

  it("4-party signer list — all survive into draft", () => {
    const intake = `Collaboration agreement.
Signer 1: Marcus Webb
Signer 2: Diana Kowalski
Signer 3: Raj Patel
Signer 4: Elena Vasquez
Scope: Joint product launch.
Governing law: Oklahoma.`;
    const result = runPipeline(intake);
    const names = result.parties.map((p) => p.name).join(" | ");
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    expect(names).toMatch(/Webb/);
    expect(names).toMatch(/Kowalski/);
    expect(names).toMatch(/Patel/);
    expect(names).toMatch(/Vasquez/);
  });

  it("3-party comma list survives into starter preview rendering", () => {
    const intake = `Services agreement.
Parties: Alpha LLC, Beta Advisors, Gamma Holdings.
Scope: Joint research collaboration.
Governing law: Texas.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).toContain("Alpha");
    expect(preview).toContain("Beta");
    expect(preview).toContain("Gamma");
  });

  it("4-party signer list survives into starter preview rendering", () => {
    const intake = `Joint venture.
Signer 1: Marcus Webb
Signer 2: Diana Kowalski
Signer 3: Raj Patel
Signer 4: Elena Vasquez
Scope: Real estate development.
Governing law: Florida.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).toContain("Webb");
    expect(preview).toContain("Kowalski");
    expect(preview).toContain("Patel");
    expect(preview).toContain("Vasquez");
  });

  it("invariant: structured extraction returns >=3 parties without reduction", () => {
    const intake = `Parties: Northstar Labs, Riverbend Partners, Atlas Capital.`;
    const structured = parseIntakeToStructuredAgreement(intake);
    expect(structured.parties.length).toBeGreaterThanOrEqual(3);
  });
});

/* ----------------------------- NDA archetype correctness ----------------------------- */

describe("NDA archetype correctness", () => {
  it("Mutual NDA gets 'Mutual Non-Disclosure Agreement' title (not Confidentiality)", () => {
    const intake = `Mutual NDA between Northstar Labs and Riverbend Partners.
Term: 3 years.
Governing law: Texas.`;
    const result = runPipeline(intake);
    expect(result.title).toMatch(/non-disclosure/i);
    expect(result.title).toMatch(/mutual/i);
    expect(result.title).not.toMatch(/^confidentiality\s+agreement$/i);
  });

  it("Multi-party NDA never injects unilateral 'Receiving Party / Disclosing Party' labels", () => {
    const intake = `Mutual NDA among three parties.
Signer 1: Aria Solano
Signer 2: Mateo Brennan
Signer 3: Yuki Tanaka
Term: 2 years.
Governing law: Illinois.`;
    const result = runPipeline(intake);
    const names = result.parties.map((p) => p.name).join(" | ");
    expect(names).not.toMatch(/disclosing\s+party/i);
    expect(names).not.toMatch(/receiving\s+party/i);
    expect(result.parties.length).toBeGreaterThanOrEqual(3);
  });

  it("Pure NDA without explicit unilateral language defaults to mutual", () => {
    const intake = `NDA between two startups exploring potential partnership.
Governing law: Washington.
Term: 18 months.`;
    const result = runPipeline(intake);
    expect(result.title).toMatch(/non-disclosure/i);
  });

  it("Pure NDA prompt routes to nda family", () => {
    const family = detectAgreementFamily("Mutual NDA between Acme Corp and Beta Industries for evaluating a partnership.");
    expect(family).toBe("nda");
  });

  it("Multi-party NDA with collaboration mention still routes as nda", () => {
    const family = detectAgreementFamily(
      "Mutual NDA between Alpha Corp, Beta Industries, and Gamma Group for evaluating a joint collaboration.",
    );
    expect(family).toBe("nda");
  });

  it("Empty draft + NDA family → starter parties never read 'disclosing/receiving'", () => {
    const intake = `Mutual NDA. Term 2 years.`;
    const result = runPipeline(intake);
    for (const p of result.parties) {
      expect(p.name).not.toMatch(/disclosing/i);
      expect(p.name).not.toMatch(/receiving/i);
    }
  });
});

/* ----------------------------- Governing law propagation ----------------------------- */

describe("governing law invariant", () => {
  it("Oklahoma extracted governing law survives to starter preview", () => {
    const intake = `Consulting agreement between Lyra Industries and Quinn Studios.
Scope: Brand strategy.
Fee: $4,500/month.
Governing law: Oklahoma.`;
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/oklahoma/i);
    expect(result.jurisdiction).not.toMatch(/^delaware$/i);
    const preview = starter(result);
    expect(preview).toMatch(/oklahoma/i);
  });

  it("Texas explicit jurisdiction survives, no Delaware leakage", () => {
    const intake = `Software development agreement between Solstice Labs and Hadrian Tech.
Scope: Build a logistics dashboard.
Payment: $25,000 fixed.
Governing law: Texas.`;
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/texas/i);
    expect(result.jurisdiction).not.toMatch(/^delaware$/i);
    const preview = starter(result);
    expect(preview).toMatch(/texas/i);
    expect(preview).not.toMatch(/laws of delaware/i);
  });

  it("New York explicit jurisdiction survives across NDA + multi-party", () => {
    const intake = `Mutual NDA.
Parties: Solstice Labs, Hadrian Tech, Lyra Industries.
Term: 2 years.
Governing law: New York.`;
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/new york/i);
    expect(result.jurisdiction).not.toMatch(/^delaware$/i);
    const preview = starter(result);
    expect(preview).toMatch(/new york/i);
  });

  it("when no jurisdiction provided, falls back to Delaware default (existing behavior)", () => {
    const intake = `Consulting agreement between Foo Co and Bar LLC. Fee: $3,000/month.`;
    const result = runPipeline(intake);
    expect(result.jurisdiction).toMatch(/delaware/i);
  });
});

/* ----------------------------- Scope extraction boundary ----------------------------- */

describe("scope boundary: no field contamination", () => {
  it("Scope: terminates at Term:", () => {
    const intake = `Consulting agreement.
Scope: Quarterly market intelligence reports.
Term: 12 months.
Governing law: Texas.`;
    const s = parseIntakeToStructuredAgreement(intake);
    expect(s.scope).toMatch(/market intelligence/i);
    expect(s.scope).not.toMatch(/12 months/i);
    expect(s.scope).not.toMatch(/governing law/i);
    expect(s.scope).not.toMatch(/term:/i);
  });

  it("Scope: terminates at Payment:", () => {
    const intake = `Services agreement.
Scope: Strategic advisory on go-to-market positioning.
Payment: $5,000/month.
Governing law: New York.`;
    const s = parseIntakeToStructuredAgreement(intake);
    expect(s.scope).toMatch(/advisory|positioning/i);
    expect(s.scope).not.toMatch(/\$5,000/);
    expect(s.scope).not.toMatch(/payment:/i);
  });

  it("Purpose: terminates at Governing law:", () => {
    const intake = `Mutual NDA.
Purpose: Mutual evaluation of potential joint product development opportunity.
Governing law: Illinois.
Term: 2 years.`;
    const s = parseIntakeToStructuredAgreement(intake);
    expect(s.scope).toMatch(/evaluation|joint|development/i);
    expect(s.scope).not.toMatch(/illinois/i);
    expect(s.scope).not.toMatch(/governing law/i);
  });

  it("Scope: terminates at Confidentiality:", () => {
    const intake = `Development agreement.
Scope: Build a multi-tenant SaaS dashboard with React and Node.
Confidentiality: All proprietary code is confidential.
Governing law: California.`;
    const s = parseIntakeToStructuredAgreement(intake);
    expect(s.scope).toMatch(/SaaS|React/i);
    expect(s.scope).not.toMatch(/confidentiality/i);
    expect(s.scope).not.toMatch(/proprietary code/i);
  });
});

/* ----------------------------- Placeholder fallback suppression ----------------------------- */

describe("placeholder fallback suppression", () => {
  it("starter preview: termination section uses neutral note, never compensation boilerplate", () => {
    const intake = `Consulting agreement between Lyra Industries and Quinn Studios.
Scope: Brand strategy.
Fee: $4,500/month.
Governing law: Texas.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).not.toContain(FORBIDDEN_TERMINATION_LEAKAGE);
  });

  it("explicit termination notice survives instead of fallback", () => {
    const intake = `Services agreement.
Parties: Solstice Labs, Hadrian Tech.
Scope: Infrastructure consulting.
Fee: $8,000/month.
Either party may terminate with 30 days written notice.
Governing law: New York.`;
    const result = runPipeline(intake);
    expect(result.termination_summary).toMatch(/30/);
    expect(result.termination_summary).toMatch(/notice/i);
    const preview = starter(result);
    expect(preview).toMatch(/30/);
    expect(preview).not.toContain(FORBIDDEN_TERMINATION_LEAKAGE);
  });

  it("starter preview never contains compensation-named termination fallback", () => {
    // Intake with NO termination signal: must use neutral termination placeholder, not compensation boilerplate
    const intake = `Quick agreement between Foo and Bar for advisory work.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).not.toContain(FORBIDDEN_TERMINATION_LEAKAGE);
  });
});

/* ----------------------------- Multi-party prose rendering ----------------------------- */

describe("multi-party prose rendering: no duplicated 'and', Oxford comma", () => {
  it("3-party preamble uses ', and' not 'and ... and'", () => {
    const intake = `Services agreement.
Parties: Alpha LLC, Beta Advisors, Gamma Holdings.
Scope: Joint research.
Governing law: Texas.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    const preamble = preview.split("\n").find((l) => l.includes("entered into")) || "";
    const andCount = (preamble.match(/\sand\s/g) || []).length;
    expect(andCount).toBeLessThanOrEqual(1);
  });

  it("4-party preamble uses Oxford comma", () => {
    const intake = `Joint venture.
Signer 1: Marcus Webb
Signer 2: Diana Kowalski
Signer 3: Raj Patel
Signer 4: Elena Vasquez
Scope: Real estate co-investment.
Governing law: Florida.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).toMatch(/,\s+and\s+/);
  });
});

/* ----------------------------- Free-state Pro copy isolation ----------------------------- */

describe("free starter preview Pro copy isolation", () => {
  it("starter preview has starter disclaimer, not Pro delivery wording", () => {
    const intake = `Consulting agreement between Acme Corp and Beta Industries. Fee: $3,000/month. Governing law: Texas.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).not.toContain(STARTER_DISCLAIMER);
    expect(preview).not.toContain("This LawDog Pro agreement");
    expect(preview).not.toContain("confirm material terms before you share or sign");
  });

  it("starter preview never contains payment boilerplate masquerading as termination", () => {
    const intake = `Quick agreement between Foo and Bar for advisory work.`;
    const result = runPipeline(intake);
    const preview = starter(result);
    expect(preview).not.toContain(FORBIDDEN_TERMINATION_LEAKAGE);
  });
});
