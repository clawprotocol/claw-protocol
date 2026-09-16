import { afterEach, describe, expect, it } from "vitest";
import {
  buildSigningHandoffManifestFromDraftParties,
  evaluatePaidProSigningHandoffReadiness,
  resolvePaidProSigningHandoffPartyManifest,
} from "./paidProSigningHandoffAuthority";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";

const FOUR_PARTY = [
  {
    name: "Lumen Bioinformatics Inc.",
    role: "Platform Developer",
    email: "elena.vasquez@lumenbio.com",
    signerName: "Dr. Elena Vasquez",
  },
  {
    name: "Thalassa Data Systems LLC",
    role: "Data Infrastructure Provider",
    email: "marcus.webb@thalassadata.com",
    signerName: "Marcus Webb",
  },
  {
    name: "Coastal Meridian Analytics LLC",
    role: "Analytics Integrator",
    email: "priya.nair@coastalmeridian.com",
    signerName: "Priya Nair",
  },
  {
    name: "Vanguard Regulatory Sciences Ltd.",
    role: "Regulatory Compliance Advisor",
    email: "james.osullivan@vanguardregulatory.co",
    signerName: "James O'Sullivan",
  },
];

describe("signing handoff from persisted draft parties", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProSourceOfTruth();
  });

  it("reads snake_case signer_name from a remounted Harbor draft", () => {
    const manifest = buildSigningHandoffManifestFromDraftParties([
      {
        name: "Harbor Peak Analytics LLC",
        role: "Consultant",
        email: "pat.harbor@harbor.test",
        signer_name: "Pat Harbor",
      },
      {
        name: "Ironvale Manufacturing Inc.",
        role: "Client",
        email: "sam.ironvale@ironvale.test",
        signer_name: "Sam Ironvale",
      },
      {
        name: "Alex Rivera",
        role: "Advisor",
        email: "alex.rivera@advisor.test",
        signer_name: "Alex Rivera",
      },
    ]);
    expect(manifest.parties.map((party) => party.signerName)).toEqual([
      "Pat Harbor",
      "Sam Ironvale",
      "Alex Rivera",
    ]);
    expect(manifest.parties.map((party) => party.roleLabel)).toEqual([
      "Consultant",
      "Client",
      "Advisor",
    ]);
  });

  it("rebuilds a four-party manifest from saved parties when session snapshot is gone", () => {
    const manifest = buildSigningHandoffManifestFromDraftParties(FOUR_PARTY);
    expect(manifest.parties).toHaveLength(4);
    expect(manifest.parties[3]).toMatchObject({
      partyName: "Vanguard Regulatory Sciences Ltd.",
      email: "james.osullivan@vanguardregulatory.co",
      signerName: "James O'Sullivan",
    });
    expect(resolvePaidProSigningHandoffPartyManifest({ draftParties: FOUR_PARTY }).parties[3]?.signerName).toBe(
      "James O'Sullivan",
    );
  });

  it("does not keep a sibling signer name when the persisted Vanguard row has James", () => {
    const readiness = evaluatePaidProSigningHandoffReadiness({
      manifest: {
        parties: [
          {
            index: 0,
            role: "client",
            partyName: "Lumen Bioinformatics Inc.",
            email: "",
            signerName: "Dr. Elena Vasquez",
            signerTitle: null,
            roleLabel: "Platform Developer",
            signerKind: "entity_representative",
            isSenderSide: true,
            isIndividual: false,
          },
          {
            index: 1,
            role: "service_provider",
            partyName: "Thalassa Data Systems LLC",
            email: "",
            signerName: "Marcus Webb",
            signerTitle: null,
            roleLabel: "Data Infrastructure Provider",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
          {
            index: 2,
            role: "party_2",
            partyName: "Coastal Meridian Analytics LLC",
            email: "",
            signerName: "Priya Nair",
            signerTitle: null,
            roleLabel: "Analytics Integrator",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
          {
            index: 3,
            role: "party_3",
            partyName: "Vanguard Regulatory Sciences Ltd.",
            email: "",
            signerName: "Marcus Webb",
            signerTitle: null,
            roleLabel: "Regulatory Compliance Advisor",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
        ],
      },
      draftParties: FOUR_PARTY,
      requiredPartyCount: 4,
    });
    expect(readiness.ok).toBe(true);
    expect(readiness.recipients[3]).toMatchObject({
      partyLegalName: "Vanguard Regulatory Sciences Ltd.",
      signerName: "James O'Sullivan",
      email: "james.osullivan@vanguardregulatory.co",
    });
  });
});
