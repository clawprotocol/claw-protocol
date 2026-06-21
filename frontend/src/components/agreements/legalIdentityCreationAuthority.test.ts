/**
 * Legal Identity Creation Authority — platform regression suite.
 * Extraction → Resolution → Legal Party Authority pipeline.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  assertUserVisibleRenderIntegrity,
  compareLegalIdentityContinuity,
  containsForbiddenIdentityRenderTokens,
  detectDuplicateLegalIdentities,
  resolveAuthoritativeLegalPartyIdentities,
} from "./legalPartyIdentityAuthority";
import {
  classifyIdentityToken,
  extractLegalEntityFromAliasParenthetical,
  isLegalIdentityRoleAlias,
  isUnauthorizedLegalIdentityCandidate,
  resolveExtractedCandidatesToLegalEntities,
  resolveLegalIdentitiesFromExtraction,
} from "./legalIdentityResolution";
import {
  buildPaidProSignerMetadataParties,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolveSignerSetupPartyIdentities } from "./signerSetupPartyIdentity";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const TWO_PARTY_INTAKE = [
  "Create a consulting agreement",
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")',
  "for AI workflow setup.",
].join(" ");

function expectOneEntity(candidates: string[]) {
  const resolved = resolveExtractedCandidatesToLegalEntities(candidates);
  expect(resolved).toHaveLength(1);
  expect(resolved[0]?.legalEntityName).toMatch(/Red Mesa Logistics LLC/i);
}

describe("legalIdentityCreationAuthority — alias resolution", () => {
  it.each([
    ["my company", RED],
    ["our company", RED],
    ["Client (Red Mesa Logistics LLC)", "Client (Red Mesa Logistics LLC)"],
    ["Customer (Red Mesa Logistics LLC)", "Customer (Red Mesa Logistics LLC)"],
    ["Vendor (Harbor Peak Automation LLC)", "Vendor (Harbor Peak Automation LLC)"],
    ["Contractor (Harbor Peak Automation LLC)", "Contractor (Harbor Peak Automation LLC)"],
    ["Party A (Red Mesa Logistics LLC)", "Party A (Red Mesa Logistics LLC)"],
    ["Party B (Harbor Peak Automation LLC)", "Party B (Harbor Peak Automation LLC)"],
  ])('"%s" + entity resolves to one legal entity', (alias, entity) => {
    if (alias.includes("Harbor Peak")) {
      const resolved = resolveExtractedCandidatesToLegalEntities([alias, entity]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.legalEntityName).toMatch(/Harbor Peak Automation LLC/i);
      return;
    }
    expectOneEntity([alias, entity]);
  });

  it("role alias alone is never a legal entity", () => {
    expect(classifyIdentityToken("my company")).toBe("role_alias");
    expect(classifyIdentityToken("Client")).toBe("role_alias");
    expect(classifyIdentityToken("Party A")).toBe("role_alias");
    expect(isLegalIdentityRoleAlias("our company")).toBe(true);
  });

  it("parenthetical alias extracts embedded entity only", () => {
    expect(extractLegalEntityFromAliasParenthetical("Client (Red Mesa Logistics LLC)")).toBe(RED);
    expect(extractLegalEntityFromAliasParenthetical("Vendor (Harbor Peak Automation LLC)")).toBe(HARBOR);
  });

  it("two-party alias pairs resolve to two entities not four", () => {
    const resolved = resolveExtractedCandidatesToLegalEntities([
      "my company",
      RED,
      "our company",
      HARBOR,
    ]);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.legalEntityName)).toEqual([RED, HARBOR]);
  });
});

describe("legalIdentityCreationAuthority — unauthorized identity creation", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  const metadataCandidates = [
    { label: "reviewer email", value: "reviewer@example.com" },
    { label: "notice recipient", value: "notices@harborpeak.test" },
    { label: "delivery recipient", value: "archive@example.com" },
    { label: "affiliate contact", value: "partner@affiliate.test" },
    { label: "organization profile", value: "contacts@acme.test" },
    { label: "signer metadata email", value: "signer@example.com" },
    { label: "API metadata", value: "billing@example.com" },
    { label: "import metadata", value: "import@parser.test" },
    { label: "UI metadata", value: "ui-draft@example.com" },
  ];

  it.each(metadataCandidates)("$label cannot create a legal party", ({ value }) => {
    expect(isUnauthorizedLegalIdentityCandidate(value)).toBe(true);
    const identities = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftPartyNames: [RED, HARBOR, value],
      consumerPartyCount: 3,
    });
    expect(identities).toHaveLength(2);
    expect(identities.map((i) => i.legalEntityName)).toEqual([RED, HARBOR]);
  });

  it("signer metadata UI count cannot inflate legal identities", () => {
    const parties = buildPaidProSignerMetadataParties(
      {
        partyCount: 4,
        recipient1Name: RED,
        recipient2Name: HARBOR,
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        extraPartyReviewEmails: ["ghost@example.com"],
        partySignerNames: ["A", "B", "Ghost"],
        partySignerTitles: ["", "", ""],
        partyAddresses: ["", "", ""],
      },
      { intakeText: TWO_PARTY_INTAKE, draftPartyNames: [RED, HARBOR] },
    );
    expect(parties).toHaveLength(2);
  });

  it("consumeAuthoritativeSignerCount blocks metadata-inflated consumer count", () => {
    expect(
      consumeAuthoritativeSignerCount(
        "unauthorized_creation_probe",
        {
          intakeText: TWO_PARTY_INTAKE,
          draftPartyNames: [RED, HARBOR, "reviewer@example.com"],
          rawPartyCount: 3,
          userExpandedPartyCount: 3,
        },
        3,
      ),
    ).toBe(2);
  });
});

describe("legalIdentityCreationAuthority — identity continuity", () => {
  it("rejects Party A / Party A when count matches", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: [
        { name: "Red Mesa Logistics", role: "party_a" },
        { name: "LLC", role: "party_b" },
        { name: HARBOR, role: "party" },
      ],
    });
    const wrong = [RED, RED];
    const result = compareLegalIdentityContinuity(authority, wrong);
    expect(result.ok).toBe(false);
    expect(result.authorityCount).toBe(2);
    expect(result.consumerCount).toBe(2);
    expect(detectDuplicateLegalIdentities(wrong).duplicate).toBe(true);
  });

  it("signer setup identities match authority across corrupted draft", () => {
    const authority = resolveAuthoritativeLegalPartyIdentities({
      intakeText: TWO_PARTY_INTAKE,
      draftParties: [
        { name: "Red Mesa Logistics", role: "party_a" },
        { name: "LLC", role: "party_b" },
        { name: HARBOR, role: "party" },
      ],
    });
    const cards = resolveSignerSetupPartyIdentities({
      parties: [
        { name: "Red Mesa Logistics" },
        { name: "LLC" },
        { name: HARBOR },
      ],
      intakeText: TWO_PARTY_INTAKE,
    });
    expect(compareLegalIdentityContinuity(authority, cards.map((c) => c.legalEntityName)).ok).toBe(true);
  });
});

describe("legalIdentityCreationAuthority — render integrity", () => {
  it("forbids PARTY_A, PARTY_B, numbered placeholders, and template variables", () => {
    const bad = [
      "PARTY_A: Red Mesa",
      "PARTY_B: Harbor Peak",
      "Email: [EMAIL_1]",
      "If to [ORG_3]:",
      "Name: [SIGNER_NAME]",
      "Addr: {{company}}",
      "City: ${address}",
    ].join("\n");
    expect(containsForbiddenIdentityRenderTokens(bad)).toBe(true);
    expect(assertUserVisibleRenderIntegrity(bad).ok).toBe(false);
  });

  it("clean legal copy passes render integrity", () => {
    const good = `This Agreement is between ${RED} and ${HARBOR}.`;
    expect(assertUserVisibleRenderIntegrity(good).ok).toBe(true);
  });
});

describe("legalIdentityCreationAuthority — extraction pipeline", () => {
  it("intake authority bypasses noisy extraction when labeled/between parties exist", () => {
    const resolved = resolveLegalIdentitiesFromExtraction({
      candidates: ["my company", "LLC", "party_a", HARBOR],
      intakeText: TWO_PARTY_INTAKE,
    });
    expect(resolved.map((r) => r.legalEntityName)).toEqual([RED, HARBOR]);
    expect(resolved.every((r) => r.resolvedFrom === "intake_authority")).toBe(true);
  });
});
