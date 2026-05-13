import { describe, expect, it } from "vitest";
import {
  applyAgreementFamilyIntakeShell,
  extractFormationJurisdictionHint,
  extractLlcDisplayName,
  runIntakeDefaultsAndRoles,
} from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

describe("extractLlcDisplayName / extractFormationJurisdictionHint", () => {
  const qa =
    "Put together a standard operating agreement for LLC. The name of the LLC is ABC LLC. The LLC is formed in Oklahoma.";

  it("extracts LLC display name from QA phrasing", () => {
    expect(extractLlcDisplayName(qa)).toBe("ABC LLC");
  });

  it("extracts formation state hint", () => {
    expect(extractFormationJurisdictionHint(qa)).toBe("Oklahoma");
  });
});

describe("applyAgreementFamilyIntakeShell operating_agreement", () => {
  it("produces a full structured shell from sparse parse", () => {
    const sparse: ParsedDraftShape = {
      title: "",
      jurisdiction: "TBD",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
      agreement_family: "operating_agreement",
    };
    const raw =
      "Put together a standard operating agreement for LLC. The name of the LLC is ABC LLC. The LLC is formed in Oklahoma.";
    const out = applyAgreementFamilyIntakeShell(sparse, raw, "operating_agreement");
    expect(out.title).toMatch(/Operating Agreement/i);
    // Canonical title is "Operating Agreement"; the company name surfaces in `llc_company_name`
    // (and the OA preview "Company:" line) — never as a hybrid title (regression spec P3).
    expect(out.llc_company_name).toBe("ABC LLC");
    expect(out.jurisdiction).toMatch(/Oklahoma/i);
    expect(out.parties.length).toBeGreaterThanOrEqual(2);
    expect(out.purpose.length).toBeGreaterThan(20);
    expect(out.payment_terms.toLowerCase()).toContain("not applicable");
    expect(out.duration).toBeTruthy();
    expect(out.effective_date).toBeTruthy();
  });
});

describe("runIntakeDefaultsAndRoles", () => {
  it("routes QA string through operating shell without extra API", () => {
    const sparse: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "TBD",
      parties: [{ name: "X", role: "party" }],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const raw =
      "Put together a standard operating agreement for LLC. The name of the LLC is ABC LLC. The LLC is formed in Oklahoma.";
    const out = runIntakeDefaultsAndRoles(sparse, raw, true, defaultIntakePartyRoleLabels());
    expect(out.agreement_family).toBe("operating_agreement");
    expect(out.parties.length).toBe(2);
  });
});
