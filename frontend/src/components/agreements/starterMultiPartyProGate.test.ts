import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  assessStarterComplexityGate,
  assessStarterMultiPartyProRequirement,
  buildStarterProCheckoutPendingDraft,
  detectRevenueShareLanguage,
} from "./starterMultiPartyProGate";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteRegression.test";

export const TEST375_ROLE_LABEL_TWO_PARTY_INTAKE = `Client:
Blue Canyon Analytics LLC

Service Provider:
Harbor Peak Automation LLC

Simple consulting and implementation services.
12 month term.
Monthly payment.
Texas law.`;

const TWO_PARTY_INTAKE = `Consulting agreement between Acme LLC and Beta Corp.
Scope: monthly marketing support.
Payment: $5,000 per month.
Term: 12 months.
California law governs.`;

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

describe("starterComplexityGate", () => {
  it("gates Test371 quadrpartite labeled intake", () => {
    const gate = assessStarterComplexityGate(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties).toHaveLength(4);
    expect(gate.coordinatorName).toMatch(/Alex Morgan/i);
    expect(gate.keyTerms.length).toBeGreaterThan(0);
    expect(gate.hasRevenueShare).toBe(true);
    expect(gate.hasCoordinator).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });

  it("alias assessStarterMultiPartyProRequirement matches assessStarterComplexityGate", () => {
    expect(assessStarterMultiPartyProRequirement(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE).required).toBe(true);
  });

  it("does not gate ordinary two-party commercial intake", () => {
    const gate = assessStarterComplexityGate(TWO_PARTY_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.parties.length).toBeLessThanOrEqual(2);
  });

  it("detects revenue share language in Test371 intake", () => {
    expect(detectRevenueShareLanguage(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE)).toBe(true);
  });

  it("Pro checkout pending draft preserves four labeled parties without corrupted parse names", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(pending.parties).toHaveLength(4);
    expect(pending.parties.map((p) => p.name)).toContain("Pioneer Freight Solutions LLC");
    expect(pending.parties.map((p) => p.name)).not.toContain("SOFTWARE PLATFORM AGREEMENT");
    expect(pending.parties.map((p) => p.name)).not.toContain("licensing revenue will be shared");
  });

  it("free preview from Pro pending path must not surface corrupted party strings", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    const preview = buildAgreementPreviewText(pending, { starterPreview: true });
    expect(preview).not.toMatch(/SOFTWARE PLATFORM AGREEMENT/);
    expect(preview).not.toMatch(/licensing revenue will be shared/i);
  });

  it("two-party labeled blocks do not gate when no complexity signals", () => {
    const intake = `Party 1
Legal Entity: Acme LLC
Signer Name: Jane Doe

Party 2
Legal Entity: Beta Corp
Signer Name: John Smith

Scope: software support. Texas law governs.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(false);
  });

  it("coordinator block with two labeled parties gates free starter", () => {
    const intake = `Party 1
Legal Entity: Acme LLC
Signer Name: Jane Doe

Party 2
Legal Entity: Beta Corp
Signer Name: John Smith

Coordinator
Name: Pat Lee

Scope: joint venture coordination.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("coordinator_or_non_party_actor");
  });

  it("gates review workflow language", () => {
    const intake = `Agreement between Acme LLC and Beta Corp.
Both parties will use a review link and approval workflow before signing.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("review_approval_workflow");
  });

  it("gates joint venture structure with multiple parties", () => {
    const intake = `Party 1
Legal Entity: Alpha LLC
Signer Name: Alex

Party 2
Legal Entity: Beta LLC
Signer Name: Blake

Party 3
Legal Entity: Gamma LLC
Signer Name: Casey

Joint venture implementation partnership with multi-vendor fees.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });
});

describe("Test375 role-label two-party free starter", () => {
  it("allows Client/Service Provider labeled intake with monthly payment", () => {
    const gate = assessStarterComplexityGate(TEST375_ROLE_LABEL_TWO_PARTY_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.partyCount).toBe(2);
    expect(gate.parties).toHaveLength(2);
    expect(gate.parties).toEqual(
      expect.arrayContaining(["Blue Canyon Analytics LLC", "Harbor Peak Automation LLC"]),
    );
    expect(gate.hasMultiProviderPayment).toBe(false);
  });

  it("renders a simple two-party free starter draft from Test375 intake", () => {
    const draft = runIntakeDefaultsAndRoles(
      {
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: EMPTY_PAYMENT,
      },
      TEST375_ROLE_LABEL_TWO_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(assessStarterComplexityGate(TEST375_ROLE_LABEL_TWO_PARTY_INTAKE).required).toBe(false);
    expect(draft.parties.length).toBeGreaterThanOrEqual(2);
    const preview = buildAgreementPreviewText(draft, { starterPreview: true });
    expect(preview.length).toBeGreaterThan(200);
    expect(preview).toMatch(/Blue Canyon Analytics LLC/i);
    expect(preview).toMatch(/Harbor Peak Automation LLC/i);
  });

  it("does not gate generic monthly payment when party count is unresolved", () => {
    const intake = `Scope: consulting services.
Monthly payment.
12 month term.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(0);
    expect(gate.reasons).not.toContain("multi_provider_payment");
  });

  it("still gates revenue share with two parties", () => {
    const intake = `Client:
Acme LLC

Service Provider:
Beta Corp

Revenue share: 20% of licensing revenue to Beta Corp.`;
    const gate = assessStarterComplexityGate(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("revenue_share_or_allocation");
    expect(gate.partyCount).toBe(2);
  });
});

describe("starterComplexityGate two-party regression", () => {
  it("runIntakeDefaultsAndRoles on two-party intake still produces two parties", () => {
    const draft = runIntakeDefaultsAndRoles(
      {
        title: "",
        jurisdiction: "",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: EMPTY_PAYMENT,
      },
      TWO_PARTY_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(assessStarterComplexityGate(TWO_PARTY_INTAKE).required).toBe(false);
    expect(draft.parties.length).toBeGreaterThanOrEqual(2);
    expect(draft.parties.length).toBeLessThanOrEqual(2);
  });
});
