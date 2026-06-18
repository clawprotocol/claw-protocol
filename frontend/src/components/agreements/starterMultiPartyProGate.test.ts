import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  assessStarterMultiPartyProRequirement,
  buildStarterProCheckoutPendingDraft,
  hasRevenueShareAcrossThreePlusNamedEntities,
} from "./starterMultiPartyProGate";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteRegression.test";

const TWO_PARTY_INTAKE = `Consulting agreement between Acme LLC and Beta Corp.
Scope: monthly marketing support.
Payment: $5,000 per month.
Term: 12 months.
California law governs.`;

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

describe("starterMultiPartyProGate", () => {
  it("gates Test371 quadrpartite labeled intake", () => {
    const gate = assessStarterMultiPartyProRequirement(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties).toHaveLength(4);
    expect(gate.coordinatorName).toMatch(/Alex Morgan/i);
    expect(gate.keyTerms.length).toBeGreaterThan(0);
  });

  it("does not gate ordinary two-party commercial intake", () => {
    const gate = assessStarterMultiPartyProRequirement(TWO_PARTY_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.parties).toHaveLength(0);
  });

  it("Pro checkout pending draft preserves four labeled parties without corrupted parse names", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(pending.parties).toHaveLength(4);
    expect(pending.parties.map((p) => p.name)).toContain("Pioneer Freight Solutions LLC");
    expect(pending.parties.map((p) => p.name)).not.toContain("SOFTWARE PLATFORM AGREEMENT");
    expect(pending.parties.map((p) => p.name)).not.toContain("licensing revenue will be shared");
  });

  it("free preview from gated intake path must not surface corrupted party strings", () => {
    const pending = buildStarterProCheckoutPendingDraft(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    const preview = buildAgreementPreviewText(pending, { starterPreview: true });
    expect(preview).not.toMatch(/SOFTWARE PLATFORM AGREEMENT/);
    expect(preview).not.toMatch(/licensing revenue will be shared/i);
  });

  it("detects revenue share across three plus named entities", () => {
    const parties = ["Alpha LLC", "Beta LLC", "Gamma LLC"];
    const intake = `Revenue sharing: Alpha LLC 40%, Beta LLC 35%, Gamma LLC 25%.`;
    expect(hasRevenueShareAcrossThreePlusNamedEntities(intake, parties)).toBe(true);
  });

  it("two-party labeled blocks do not gate when no coordinator or revenue-share rule fires", () => {
    const intake = `Party 1
Legal Entity: Acme LLC
Signer Name: Jane Doe

Party 2
Legal Entity: Beta Corp
Signer Name: John Smith

Scope: software support. Texas law governs.`;
    const gate = assessStarterMultiPartyProRequirement(intake);
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
    const gate = assessStarterMultiPartyProRequirement(intake);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("coordinator_with_multiple_parties");
  });
});

describe("starterMultiPartyProGate two-party regression", () => {
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
    expect(assessStarterMultiPartyProRequirement(TWO_PARTY_INTAKE).required).toBe(false);
    expect(draft.parties.length).toBeGreaterThanOrEqual(2);
    expect(draft.parties.length).toBeLessThanOrEqual(2);
  });
});
