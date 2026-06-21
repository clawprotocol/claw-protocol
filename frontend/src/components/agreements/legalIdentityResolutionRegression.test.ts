/**
 * Legal Identity Resolution regression — alias / jurisdiction / duplicate entity promotion.
 */

import { describe, expect, it } from "vitest";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import {
  resolveLegalIdentitiesFromExtraction,
  resolveExtractedCandidatesToLegalEntities,
  isLegalIdentityRoleAlias,
} from "./legalIdentityResolution";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveAuthoritativeLegalPartyIdentities } from "./legalPartyIdentityAuthority";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

export const QA_CONSULTING_ALIAS_INTAKE = `
I need a consulting agreement between my company, Red Mesa Logistics LLC, and Harbor Peak Automation LLC.

Harbor Peak Automation LLC will provide workflow automation consulting, AI integration planning, process improvement services, and implementation support.

My company will pay $7,500 per month for 12 months.

Include confidentiality, intellectual property ownership, limitation of liability, notice provisions, termination rights, governing law, and venue in Oklahoma.

Red Mesa Logistics LLC should be treated as the client and Harbor Peak Automation LLC should be treated as the service provider.
`.trim();

const NATURAL_ALIAS_FRAGMENT =
  "between my company, Red Mesa Logistics LLC, and Harbor Peak Automation LLC";

const JURISDICTION_CONTAMINATION = `
governing law and venue in Oklahoma. Red Mesa Logistics LLC should be client and Harbor Peak Automation LLC service provider.
`.trim();

const THREE_PARTY_INTAKE = `
Agreement among Alpha Logistics LLC, Beta Systems Inc., and Gamma Holdings LLC for warehouse software.
Texas law governs.
`.trim();

describe("legalIdentityResolutionRegression — QA consulting alias intake", () => {
  it("resolves QA prompt to exactly two legal parties", () => {
    const resolved = resolveLegalIdentitiesFromExtraction({ intakeText: QA_CONSULTING_ALIAS_INTAKE });
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.legalEntityName)).toEqual([RED, HARBOR]);
  });

  it("starter gate does not false-positive Pro for QA prompt", () => {
    const gate = assessStarterComplexityGate(QA_CONSULTING_ALIAS_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.parties).toHaveLength(2);
    expect(gate.partyCount).toBe(2);
    expect(gate.parties).toContain(RED);
    expect(gate.parties).toContain(HARBOR);
  });

  it("gate party list excludes aliases, jurisdiction prefixes, and duplicates", () => {
    const parties = resolveStarterGatePartyLegalEntities(QA_CONSULTING_ALIAS_INTAKE);
    expect(parties).toHaveLength(2);
    expect(parties.some((p) => /my company/i.test(p))).toBe(false);
    expect(parties.some((p) => /oklahoma/i.test(p))).toBe(false);
    expect(parties.some((p) => p.includes(","))).toBe(false);
  });

  it("signer count authority resolves to 2 for QA prompt", () => {
    expect(
      consumeAuthoritativeSignerCount(
        "qa_alias_regression",
        { intakeText: QA_CONSULTING_ALIAS_INTAKE, draftPartyNames: partiesFromGate(QA_CONSULTING_ALIAS_INTAKE) },
        4,
      ),
    ).toBe(2);
  });
});

describe("legalIdentityResolutionRegression — natural alias", () => {
  it("between my company + two LLCs resolves to two legal parties", () => {
    const resolved = resolveExtractedCandidatesToLegalEntities(
      [NATURAL_ALIAS_FRAGMENT, RED, HARBOR, "my company"],
      { intakeText: NATURAL_ALIAS_FRAGMENT },
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.legalEntityName)).toEqual([RED, HARBOR]);
  });
});

describe("legalIdentityResolutionRegression — jurisdiction contamination", () => {
  it("strips Oklahoma prefix from Red Mesa entity", () => {
    const resolved = resolveExtractedCandidatesToLegalEntities(
      ["Oklahoma. Red Mesa Logistics LLC", RED, HARBOR],
      { intakeText: JURISDICTION_CONTAMINATION },
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.legalEntityName)).toEqual([RED, HARBOR]);
    expect(resolved.some((r) => /oklahoma/i.test(r.legalEntityName))).toBe(false);
  });
});

describe("legalIdentityResolutionRegression — duplicate entity collapse", () => {
  it("collapses repeated Harbor Peak mentions to one identity", () => {
    const resolved = resolveExtractedCandidatesToLegalEntities(
      [
        `${HARBOR}, ${HARBOR}`,
        HARBOR,
        RED,
        "Harbor Peak Automation LLC will provide services",
      ],
      { intakeText: `between ${RED} and ${HARBOR}. ${HARBOR} provides consulting.` },
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.filter((r) => /Harbor Peak/i.test(r.legalEntityName))).toHaveLength(1);
  });
});

describe("legalIdentityResolutionRegression — alias-only rejection", () => {
  it.each([
    "my company",
    "our company",
    "Client",
    "Service Provider",
    "Contractor",
    "Vendor",
    "Party A",
    "Party B",
  ])('"%s" is never a legal party', (alias) => {
    expect(isLegalIdentityRoleAlias(alias)).toBe(true);
    const resolved = resolveExtractedCandidatesToLegalEntities([alias, RED, HARBOR]);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(alias);
    expect(resolved).toHaveLength(2);
  });
});

describe("legalIdentityResolutionRegression — legitimate 3-party", () => {
  it("three labeled legal entities remain 3 and Pro-gated", () => {
    const parties = resolveStarterGatePartyLegalEntities(THREE_PARTY_INTAKE);
    const resolved = resolveLegalIdentitiesFromExtraction({ intakeText: THREE_PARTY_INTAKE });
    const gate = assessStarterComplexityGate(THREE_PARTY_INTAKE);
    expect(parties.length).toBeGreaterThanOrEqual(3);
    expect(resolved.length).toBeGreaterThanOrEqual(3);
    expect(gate.required).toBe(true);
  });

  it("Test379 four-party labeled intake remains 4 parties", async () => {
    const { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } = await import(
      "./starterTest379FourPartyLogisticsRegression.test"
    );
    const gate = assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.parties.length).toBeGreaterThanOrEqual(4);
  });
});

describe("legalIdentityResolutionRegression — cross-surface consistency", () => {
  it("gate, authority, and signer count agree on QA prompt", () => {
    const gateParties = resolveStarterGatePartyLegalEntities(QA_CONSULTING_ALIAS_INTAKE);
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: QA_CONSULTING_ALIAS_INTAKE,
      draftPartyNames: gateParties,
    });
    const signerCount = consumeAuthoritativeSignerCount(
      "cross_surface_qa",
      { intakeText: QA_CONSULTING_ALIAS_INTAKE, draftPartyNames: gateParties },
      gateParties.length,
    );
    expect(gateParties).toHaveLength(2);
    expect(authority).toHaveLength(2);
    expect(signerCount).toBe(2);
    expect(authority.map((a) => a.legalEntityName)).toEqual(gateParties);
  });
});

function partiesFromGate(intake: string): string[] {
  return resolveStarterGatePartyLegalEntities(intake);
}
