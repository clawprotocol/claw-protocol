/**
 * Live #99: a homepage dump that names 3 or 4 distinct people/orgs as parties
 * must funnel to Pro — never a fake 2-party Client / Service Provider starter.
 */
import { describe, expect, it } from "vitest";
import { extractNamedDumpPartyUnits } from "./intakeNamedPartyFallback";
import {
  assessStarterComplexityGate,
  isThreePlusLegalPartyGate,
  MULTI_PARTY_PRO_GATE_PRIMARY_CTA,
  rejectIneligibleStarterDraftAfterParse,
  resolveStarterMultiPartyProGatePresentation,
} from "./starterMultiPartyProGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const LIVE_THREE_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio, Diego Alvarez of Harbor Marks LLC, and Maya Chen of Westfield Counsel agree that Harbor Marks will design a logo and brand kit for Northline for $2,400 due on signing, 30 days starting August 22, 2026, Texas law. Maya reviews as counsel.";

const FOUR_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio, Diego Alvarez of Harbor Marks LLC, Maya Chen of Westfield Counsel, and Jordan Hale of Pine Street Media LLC agree that Harbor Marks will design a logo and brand kit for Northline for $2,400 due on signing, 30 days starting August 22, 2026, Texas law.";

const TWO_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas.";

const TWO_NAMED_PARTY_THIN =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false } as const;

function hollowTwoPartyStarter(): ParsedDraftShape {
  return {
    title: "SERVICES AGREEMENT",
    jurisdiction: "",
    parties: [
      { name: "Client", role: "client" },
      { name: "Harbor Marks LLC", role: "service_provider" },
    ],
    purpose: "design a logo and brand kit",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

describe("named dump party Pro gate", () => {
  it("3 named parties → Pro funnel (live 2026-08-23 dump)", () => {
    const units = extractNamedDumpPartyUnits(LIVE_THREE_NAMED_PARTY_DUMP);
    expect(units.length).toBeGreaterThanOrEqual(3);
    expect(units.join(" ")).toMatch(/Priya Shah/i);
    expect(units.join(" ")).toMatch(/Diego Alvarez/i);
    expect(units.join(" ")).toMatch(/Maya Chen/i);

    const gate = assessStarterComplexityGate(LIVE_THREE_NAMED_PARTY_DUMP);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(gate.partyCount).toBeGreaterThanOrEqual(3);
    expect(isThreePlusLegalPartyGate(gate)).toBe(true);
    expect(gate.parties.length).toBeGreaterThanOrEqual(3);
    expect(gate.parties.join(" ")).toMatch(/Maya Chen/i);
    expect(gate.parties.join(" ")).not.toMatch(/^Client$/);

    const presentation = resolveStarterMultiPartyProGatePresentation(gate);
    expect(presentation.primaryCtaLabel).toBe(MULTI_PARTY_PRO_GATE_PRIMARY_CTA);
    expect(presentation.primaryCtaLabel).toBe("Continue with Pro");
    expect(presentation.hideStarterReviewCta).toBe(true);
    expect(presentation.title).toMatch(/requires Pro/i);

    expect(rejectIneligibleStarterDraftAfterParse(LIVE_THREE_NAMED_PARTY_DUMP, hollowTwoPartyStarter())).toBe(
      true,
    );
  });

  it("4 named parties → Pro funnel", () => {
    const units = extractNamedDumpPartyUnits(FOUR_NAMED_PARTY_DUMP);
    expect(units.length).toBeGreaterThanOrEqual(4);
    expect(units.join(" ")).toMatch(/Jordan Hale/i);

    const gate = assessStarterComplexityGate(FOUR_NAMED_PARTY_DUMP);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);
    expect(isThreePlusLegalPartyGate(gate)).toBe(true);
    expect(resolveStarterMultiPartyProGatePresentation(gate).primaryCtaLabel).toBe("Continue with Pro");
    expect(rejectIneligibleStarterDraftAfterParse(FOUR_NAMED_PARTY_DUMP, hollowTwoPartyStarter())).toBe(true);
  });

  it.each([
    ["full Priya/Diego dump", TWO_NAMED_PARTY_DUMP],
    ["thin Priya hiring Diego logo", TWO_NAMED_PARTY_THIN],
  ])("2 named parties → still free starter allowed: %s", (_label, dump) => {
    const units = extractNamedDumpPartyUnits(dump);
    expect(units.length).toBeLessThan(3);

    const gate = assessStarterComplexityGate(dump);
    expect(gate.required).toBe(false);
    expect(gate.reasons).not.toContain("three_plus_legal_parties");
    expect(gate.reasons).not.toContain("not_simple_two_party_deal");
    expect(gate.partyCount).toBeLessThan(3);
    expect(isThreePlusLegalPartyGate(gate)).toBe(false);
    expect(rejectIneligibleStarterDraftAfterParse(dump, hollowTwoPartyStarter())).toBe(false);
  });
});
