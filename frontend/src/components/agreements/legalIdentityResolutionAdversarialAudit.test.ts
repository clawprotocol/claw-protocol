/**
 * Legal Identity Resolution — adversarial audit suite.
 * Proves aliases, jurisdictions, metadata, and contacts never become legal identities.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  classifyIdentityToken,
  isLegalIdentityRoleAlias,
  isUnauthorizedLegalIdentityCandidate,
  resolveExtractedCandidatesToLegalEntities,
  resolveLegalIdentitiesFromExtraction,
} from "./legalIdentityResolution";
import {
  compareLegalIdentityContinuity,
  resolveAuthoritativeLegalPartyIdentities,
} from "./legalPartyIdentityAuthority";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

/** Full adversarial candidate set from audit spec. */
export const ADVERSARIAL_CANDIDATES = [
  `Client (${RED})`,
  `Vendor (${HARBOR})`,
  `Customer:\n${RED}`,
  `Contractor:\n${HARBOR}`,
  `Party A:\n${RED}`,
  `Party B:\n${HARBOR}`,
  `Our company ("${RED}")`,
  `The Client ("${RED}")`,
  "State of Oklahoma",
  "County of Washington",
  "Tulsa, Oklahoma",
  "affiliate@company.com",
  "reviewer@company.com",
  "notices@company.com",
  RED,
  HARBOR,
] as const;

export const ADVERSARIAL_INTAKE = [
  "Create a consulting agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "",
  `Client (${RED})`,
  `Vendor (${HARBOR})`,
  "",
  "Customer:",
  RED,
  "",
  "Contractor:",
  HARBOR,
  "",
  "Party A:",
  RED,
  "",
  "Party B:",
  HARBOR,
  "",
  `Our company ("${RED}")`,
  `The Client ("${RED}")`,
  "",
  "Governing law: State of Oklahoma. Venue: County of Washington. Tulsa, Oklahoma.",
  "",
  "Notice contacts: affiliate@company.com, reviewer@company.com, notices@company.com",
].join("\n");

const ROLE_ALIASES = ["Client", "Vendor", "Customer", "Contractor", "Party A", "Party B"] as const;

const COMPANY_ALIASES = ["my company", "our company", "the company"] as const;

const JURISDICTION_TOKENS = [
  "Oklahoma",
  "State of Oklahoma",
  "Washington County",
  "County of Washington",
  "Tulsa, Oklahoma",
  "Tulsa",
] as const;

const EMAIL_TOKENS = [
  "affiliate@company.com",
  "reviewer@company.com",
  "notices@company.com",
] as const;

const CONTINUITY_REJECTED = [
  `${RED} + Client`,
  `${HARBOR} + Vendor`,
  `Oklahoma. ${RED}`,
  `${HARBOR}. ${HARBOR}`,
] as const;

function expectExactlyTwoEntities(names: readonly string[]) {
  expect(names).toHaveLength(2);
  expect(names).toContain(RED);
  expect(names).toContain(HARBOR);
}

function expectNoForbiddenPromotions(names: readonly string[]) {
  for (const alias of ROLE_ALIASES) {
    expect(names.some((n) => new RegExp(`^${alias}$`, "i").test(n))).toBe(false);
  }
  for (const alias of COMPANY_ALIASES) {
    expect(names.some((n) => new RegExp(alias, "i").test(n) && !n.includes("LLC"))).toBe(false);
  }
  for (const j of JURISDICTION_TOKENS) {
    expect(names.some((n) => n.toLowerCase() === j.toLowerCase() || n.startsWith(`${j}.`))).toBe(false);
  }
  for (const email of EMAIL_TOKENS) {
    expect(names).not.toContain(email);
  }
  expect(names.some((n) => /oklahoma/i.test(n) && !n.includes("LLC") && !n.includes("Inc"))).toBe(false);
  expect(names.some((n) => /washington/i.test(n) && !n.includes("LLC"))).toBe(false);
  expect(names.some((n) => /tulsa/i.test(n))).toBe(false);
}

describe("legalIdentityResolutionAdversarialAudit — full adversarial set", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("resolves adversarial candidates to exactly two legal entities", () => {
    const resolved = resolveExtractedCandidatesToLegalEntities([...ADVERSARIAL_CANDIDATES], {
      intakeText: ADVERSARIAL_INTAKE,
    });
    const names = resolved.map((r) => r.legalEntityName);
    expectExactlyTwoEntities(names);
    expectNoForbiddenPromotions(names);
  });

  it("resolves adversarial intake to exactly two legal entities", () => {
    const resolved = resolveLegalIdentitiesFromExtraction({ intakeText: ADVERSARIAL_INTAKE });
    const names = resolved.map((r) => r.legalEntityName);
    expectExactlyTwoEntities(names);
    expectNoForbiddenPromotions(names);
  });

  it("starter gate and authority surfaces agree on two entities", () => {
    const gateParties = resolveStarterGatePartyLegalEntities(ADVERSARIAL_INTAKE);
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: ADVERSARIAL_INTAKE,
      draftPartyNames: gateParties,
    });
    const gate = assessStarterComplexityGate(ADVERSARIAL_INTAKE);
    const signerCount = consumeAuthoritativeSignerCount(
      "adversarial_audit",
      { intakeText: ADVERSARIAL_INTAKE, draftPartyNames: gateParties },
      gateParties.length,
    );

    expectExactlyTwoEntities(gateParties);
    expectExactlyTwoEntities(authority.map((a) => a.legalEntityName));
    expect(gate.required).toBe(false);
    expect(signerCount).toBe(2);
    expectNoForbiddenPromotions(gateParties);
  });
});

describe("legalIdentityResolutionAdversarialAudit — role aliases", () => {
  it.each([...ROLE_ALIASES, "The Client"] as const)('"%s" is a role alias and never a legal entity', (alias) => {
    expect(isLegalIdentityRoleAlias(alias)).toBe(true);
    expect(classifyIdentityToken(alias)).toBe("role_alias");
    const resolved = resolveExtractedCandidatesToLegalEntities([alias, RED, HARBOR]);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(alias);
    expect(resolved).toHaveLength(2);
  });
});

describe("legalIdentityResolutionAdversarialAudit — company aliases", () => {
  it.each(COMPANY_ALIASES)('"%s" is never a legal entity', (alias) => {
    expect(isLegalIdentityRoleAlias(alias)).toBe(true);
    const resolved = resolveExtractedCandidatesToLegalEntities([alias, RED, HARBOR]);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(alias);
    expect(resolved).toHaveLength(2);
  });
});

describe("legalIdentityResolutionAdversarialAudit — jurisdictions", () => {
  it.each(JURISDICTION_TOKENS)('"%s" is never a legal entity', (token) => {
    expect(isUnauthorizedLegalIdentityCandidate(token)).toBe(true);
    const resolved = resolveExtractedCandidatesToLegalEntities([token, RED, HARBOR]);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(token);
    expect(resolved).toHaveLength(2);
  });
});

describe("legalIdentityResolutionAdversarialAudit — emails", () => {
  it.each(EMAIL_TOKENS)('"%s" is never a legal entity', (email) => {
    expect(classifyIdentityToken(email)).toBe("metadata");
    expect(isUnauthorizedLegalIdentityCandidate(email)).toBe(true);
    const resolved = resolveExtractedCandidatesToLegalEntities([email, RED, HARBOR]);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(email);
    expect(resolved).toHaveLength(2);
  });
});

describe("legalIdentityResolutionAdversarialAudit — placeholder tokens", () => {
  it.each(["[ORG_1]", "party_a", "{{company}}", "PARTY_A"])("placeholder %s is never a legal entity", (token) => {
    expect(isUnauthorizedLegalIdentityCandidate(token)).toBe(true);
    const resolved = resolveExtractedCandidatesToLegalEntities([token, RED, HARBOR]);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.legalEntityName)).not.toContain(token);
  });
});

describe("legalIdentityResolutionAdversarialAudit — identity continuity", () => {
  it("rejects contaminated identity pairs", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: `between ${RED} and ${HARBOR}`,
      draftPartyNames: [RED, HARBOR],
    });
    for (const contaminated of CONTINUITY_REJECTED) {
      const result = compareLegalIdentityContinuity(authority, [contaminated, HARBOR]);
      expect(result.ok).toBe(false);
    }
  });

  it("accepts clean Red Mesa / Harbor Peak continuity", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: `between ${RED} and ${HARBOR}`,
      draftPartyNames: [RED, HARBOR],
    });
    const result = compareLegalIdentityContinuity(authority, [RED, HARBOR]);
    expect(result.ok).toBe(true);
  });
});
