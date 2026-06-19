import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import {
  assessStarterComplexityGate,
  rejectIneligibleStarterDraftAfterParse,
  starterPreviewHasCorruptedPartyPlaceholderText,
} from "./starterMultiPartyProGate";
import { TEST375_ROLE_LABEL_TWO_PARTY_INTAKE } from "./starterMultiPartyProGate.test";

export const TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE = `
We need a logistics software platform partnership agreement among four companies.

Red Mesa Logistics LLC, Harbor Peak Automation LLC, Blue Canyon Analytics LLC, and Iron Vale Systems Inc.
will jointly develop and market a shared logistics software platform.

Revenue from the platform will be shared as follows:
- Red Mesa Logistics LLC: 35%
- Harbor Peak Automation LLC: 30%
- Blue Canyon Analytics LLC: 20%
- Iron Vale Systems Inc.: 15%

Each company will appoint one authorized representative to sign.
Amanda Foster will coordinate the agreement but is not signing as a party.

Texas law governs.
`.trim();

const TWO_PARTY_SIMPLE_INTAKE = `Consulting agreement between Acme LLC and Beta Corp.
Scope: monthly marketing support.
Payment: $5,000 per month.
Term: 12 months.
California law governs.`;

const THREE_PARTY_INTAKE = `Party 1
Legal Entity: Alpha Logistics LLC
Signer Name: Alex Morgan

Party 2
Legal Entity: Beta Systems Inc.
Signer Name: Blake Lee

Party 3
Legal Entity: Gamma Holdings LLC
Signer Name: Casey Kim

Joint platform development partnership.`;

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function parseStarterDraft(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(
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
    intake,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

describe("Test379 four-party logistics platform starter gate", () => {
  it("extracts four legal entities from natural-language intake", () => {
    const entities = resolveStarterGatePartyLegalEntities(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(entities.length).toBeGreaterThanOrEqual(4);
    expect(entities).toContain("Red Mesa Logistics LLC");
    expect(entities.some((n) => /Iron Vale Systems/i.test(n))).toBe(true);
  });

  it("routes four-party revenue-sharing platform prompt to Pro gate before starter eligibility", () => {
    const gate = assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties.length).toBeGreaterThan(2);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(gate.reasons).toContain("revenue_share_or_allocation");
    expect(gate.hasRevenueShare).toBe(true);
  });

  it("does not count coordinator as a legal party", () => {
    const gate = assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(gate.parties).not.toContain("Amanda Foster");
    expect(gate.hasCoordinator).toBe(true);
  });

  it("rejects parsed starter draft after parse when intake is ineligible", () => {
    const parsed = parseStarterDraft(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(rejectIneligibleStarterDraftAfterParse(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE, parsed)).toBe(
      true,
    );
  });

  it("three-party labeled intake routes to Pro gate", () => {
    const gate = assessStarterComplexityGate(THREE_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });

  it("two-party simple services intake remains eligible for starter", () => {
    const gate = assessStarterComplexityGate(TWO_PARTY_SIMPLE_INTAKE);
    expect(gate.required).toBe(false);
    const parsed = parseStarterDraft(TWO_PARTY_SIMPLE_INTAKE);
    expect(rejectIneligibleStarterDraftAfterParse(TWO_PARTY_SIMPLE_INTAKE, parsed)).toBe(false);
    const preview = buildAgreementPreviewText(parsed, {
      starterPreview: true,
      intakeText: TWO_PARTY_SIMPLE_INTAKE,
    });
    expect(preview.length).toBeGreaterThan(200);
    expect(starterPreviewHasCorruptedPartyPlaceholderText(preview)).toBe(false);
  });

  it("Test375 role-label two-party intake remains eligible", () => {
    expect(assessStarterComplexityGate(TEST375_ROLE_LABEL_TWO_PARTY_INTAKE).required).toBe(false);
  });

  it("starter renderer flags corrupted percentage party placeholder garbage", () => {
    expect(
      starterPreviewHasCorruptedPartyPlaceholderText(
        "Party c%, the applicable Party ^%, the applicable Party T%, the applicable Party O%.",
      ),
    ).toBe(true);
    expect(starterPreviewHasCorruptedPartyPlaceholderText("Between Acme LLC and Beta Corp.")).toBe(false);
  });

  it("blocks starter preview with ORG_3 leakage patterns", () => {
    expect(starterPreviewHasCorruptedPartyPlaceholderText("Notice to [ORG_3] regarding revenue.")).toBe(true);
  });
});
