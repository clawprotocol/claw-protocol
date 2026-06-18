import { describe, expect, it } from "vitest";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  createCoordinatorProfile,
  fromRecipientMetadata,
  getPartyById,
  getPartyBySourceSlot,
  getSigningParties,
  legalPartyIdentitiesExcludingCoordinator,
  normalizePartyIdentities,
  partyIdForLabeledPartyNumber,
  REMAINING_TWO_PARTY_ASSUMPTIONS_AUDIT,
  toPaidProSignerMetadataParties,
  toRecipientMetadata,
} from "./canonicalPartyIdentityModel";
import {
  authorityPartiesToRecipientMetadata,
  mergeLabeledPartyAuthorityIntoParties,
  recipientMetadataToAuthorityParties,
} from "./paidProSignerMetadataAuthority";
import { hydratePaidProExecutionBlockWithSignerMetadata } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest368TripartiteExecutionBlockRegression.test";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const TWO_PARTY_INTAKE = `Create a consulting agreement between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}.
Texas law governs. Electronic execution via LawDog.`;

const TRIPARTITE_WITNESS_CORPUS = `IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: _________________________
Name: _________________________
Title: _________________________
Email for Notices: _________________________
Address for Notices: _________________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: _________________________
Name: _________________________
Title: _________________________
Email for Notices: _________________________
Address for Notices: _________________________

ANALYTICS PROVIDER:
Blue Canyon Analytics LLC
By: _________________________
Name: _________________________
Title: _________________________
Email for Notices: _________________________
Address for Notices: _________________________`;

function executionTail(corpus: string): string {
  const idx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? corpus.slice(idx) : corpus;
}

describe("canonicalPartyIdentityModel architecture regression", () => {
  describe("A. 2-party control", () => {
    it("produces two party identities with stable ids and two execution sections", () => {
      const parties = normalizePartyIdentities({
        authorityParties: [
          {
            partyIndex: 0,
            partyLegalName: PAID_PRO_HARDENING_CLIENT,
            signerEmail: "client@test.com",
            signerName: "Client Signer",
            signerTitle: "CEO",
            partyAddress: "1 Main St",
          },
          {
            partyIndex: 1,
            partyLegalName: PAID_PRO_HARDENING_PROVIDER,
            signerEmail: "provider@test.com",
            signerName: "Provider Signer",
            signerTitle: "President",
            partyAddress: "2 Oak Ave",
          },
        ],
      });
      expect(parties).toHaveLength(2);
      expect(getSigningParties(parties)).toHaveLength(2);
      expect(parties[0]?.roleLabel).toBe("Client");
      expect(parties[1]?.roleLabel).toBe("Service Provider");

      const rebuilt = enforcePaidProSingleExecutionBlock(TWO_PARTY_WITNESS_CORPUS(), {
        authorityParties: toPaidProSignerMetadataParties(parties),
        intakeText: TWO_PARTY_INTAKE,
      }).text;
      const tail = executionTail(rebuilt);
      expect(countSignatureBlockHeadingsInTail(tail)).toBe(2);
      expect(tail).toMatch(/CLIENT\s*:/i);
      expect(tail).toMatch(/SERVICE PROVIDER\s*:/i);
    });
  });

  describe("B. 3-party labeled control", () => {
    it("Party 1/2/3 produce party_1/party_2/party_3 with slot-locked metadata and 3 execution sections", () => {
      const parties = normalizePartyIdentities({
        intakeText: TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE,
      });
      expect(parties).toHaveLength(3);
      expect(parties.map((p) => p.partyId)).toEqual(["party_1", "party_2", "party_3"]);
      expect(getPartyById(parties, "party_2")?.legalName).toBe("Harbor Peak Automation LLC");
      expect(getPartyBySourceSlot(parties, 2)?.legalName).toBe("Blue Canyon Analytics LLC");

      expect(getPartyBySourceSlot(parties, 0)?.signerName).toBe("Sarah Mitchell");
      expect(getPartyBySourceSlot(parties, 1)?.signerEmail).toBe("contact@harborpeakautomation.com");
      expect(getPartyBySourceSlot(parties, 1)?.noticeAddress).toContain("Bentonville");

      const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(
        TRIPARTITE_WITNESS_CORPUS,
        authorityPartiesToRecipientMetadata(toPaidProSignerMetadataParties(parties)),
      );
      const tail = executionTail(hydrated.corpus);
      expect(countSignatureBlockHeadingsInTail(tail)).toBe(3);
      expect(tail).toMatch(/ANALYTICS PROVIDER\s*:/i);
      expect(tail).toMatch(/Sarah Mitchell/i);
      expect(tail).toMatch(/contact@harborpeakautomation\.com/i);
    });
  });

  describe("C. partial metadata", () => {
    it("Party 2 without signer name/title still hydrates when email/address are known", () => {
      const intake = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;
      const merged = mergeLabeledPartyAuthorityIntoParties(
        [
          {
            partyIndex: 0,
            partyLegalName: "Red Mesa Logistics LLC",
            signerEmail: "",
            signerName: "",
            signerTitle: "",
            partyAddress: "",
          },
          {
            partyIndex: 1,
            partyLegalName: "Harbor Peak Automation LLC",
            signerEmail: "",
            signerName: "",
            signerTitle: "",
            partyAddress: "",
          },
          {
            partyIndex: 2,
            partyLegalName: "Blue Canyon Analytics LLC",
            signerEmail: "",
            signerName: "",
            signerTitle: "",
            partyAddress: "",
          },
        ],
        intake,
      );
      const identities = normalizePartyIdentities({ intakeText: intake, authorityParties: merged });
      expect(getPartyBySourceSlot(identities, 1)?.signerName).toBe("");
      expect(getPartyBySourceSlot(identities, 1)?.signerTitle).toBe("");
      expect(getPartyBySourceSlot(identities, 1)?.signerEmail).toBe("contact@harborpeakautomation.com");

      const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(
        TRIPARTITE_WITNESS_CORPUS,
        authorityPartiesToRecipientMetadata(merged),
      );
      expect(hydrated.applied).toBe(true);
      expect(hydrated.corpus).toMatch(/contact@harborpeakautomation\.com/i);
      expect(hydrated.corpus).toMatch(/Sarah Mitchell/i);
      expect(hydrated.corpus).toMatch(/Robert Henderson/i);
    });
  });

  describe("D. user as coordinator", () => {
    it("coordinator exists separately and is excluded from legal signing parties", () => {
      const coordinator = createCoordinatorProfile({
        isUser: true,
        email: "coord@lawdog.test",
        displayName: "Agreement Coordinator",
      });
      const parties = normalizePartyIdentities({
        intakeText: TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE,
      });
      const legalOnly = legalPartyIdentitiesExcludingCoordinator(parties, coordinator, true);
      expect(legalOnly).toHaveLength(3);
      expect(legalOnly.every((p) => !p.isUserParty)).toBe(true);
      expect(coordinator.isUser).toBe(true);
      expect(coordinator.userRelation).toBe("coordinator");
      expect(legalOnly.map((p) => p.partyId)).toEqual([
        partyIdForLabeledPartyNumber(1),
        partyIdForLabeledPartyNumber(2),
        partyIdForLabeledPartyNumber(3),
      ]);
    });
  });

  describe("E. legacy compatibility", () => {
    it("toRecipientMetadata populates recipient1/recipient2 for 2-party flows", () => {
      const parties = normalizePartyIdentities({
        authorityParties: [
          {
            partyIndex: 0,
            partyLegalName: PAID_PRO_HARDENING_CLIENT,
            signerEmail: "a@test.com",
            signerName: "A",
            signerTitle: "CEO",
            partyAddress: "Addr A",
          },
          {
            partyIndex: 1,
            partyLegalName: PAID_PRO_HARDENING_PROVIDER,
            signerEmail: "b@test.com",
            signerName: "B",
            signerTitle: "Mgr",
            partyAddress: "Addr B",
          },
        ],
      });
      const meta = toRecipientMetadata(parties);
      expect(meta.recipient1Name).toBe(PAID_PRO_HARDENING_CLIENT);
      expect(meta.recipient2Name).toBe(PAID_PRO_HARDENING_PROVIDER);
      expect(meta.recipient1Email).toBe("a@test.com");
      expect(meta.recipient2Email).toBe("b@test.com");
      expect(meta.partyIds).toHaveLength(2);
    });

    it("3+ parties carry partyIds/partyMetadata while recipient1/recipient2 remain derived", () => {
      const parties = normalizePartyIdentities({
        intakeText: TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE,
      });
      const meta = toRecipientMetadata(parties, ["extra@party4.test"]);
      expect(meta.partyIds).toEqual(["party_1", "party_2", "party_3"]);
      expect(meta.partyMetadata).toHaveLength(3);
      expect(meta.partyLegalNames).toHaveLength(3);
      expect(meta.recipient1Name).toBe("Red Mesa Logistics LLC");
      expect(meta.recipient2Name).toBe("Harbor Peak Automation LLC");
      expect(meta.extraPartyReviewEmails).toEqual(["extra@party4.test"]);

      const roundTrip = recipientMetadataToAuthorityParties(meta);
      expect(roundTrip).toHaveLength(3);
      expect(roundTrip[2]?.partyLegalName).toBe("Blue Canyon Analytics LLC");
    });

    it("authorityPartiesToRecipientMetadata adapter preserves legacy fields", () => {
      const meta = authorityPartiesToRecipientMetadata([
        {
          partyIndex: 0,
          partyLegalName: PAID_PRO_HARDENING_CLIENT,
          signerEmail: "a@test.com",
          signerName: "A",
          signerTitle: "CEO",
          partyAddress: "",
        },
        {
          partyIndex: 1,
          partyLegalName: PAID_PRO_HARDENING_PROVIDER,
          signerEmail: "b@test.com",
          signerName: "B",
          signerTitle: "Mgr",
          partyAddress: "",
        },
      ]);
      expect(meta.recipient1Name).toBe(PAID_PRO_HARDENING_CLIENT);
      expect(meta.partyIds?.[0]).toBeTruthy();
    });
  });

  describe("F. no two-party truncation", () => {
    it("normalizePartyIdentities preserves all labeled parties without slicing to 2", () => {
      const parties = normalizePartyIdentities({
        intakeText: TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE,
      });
      expect(parties.length).toBeGreaterThan(2);
      expect(parties).toHaveLength(3);
    });

    it("fromRecipientMetadata restores all partyIds when present", () => {
      const meta = toRecipientMetadata(
        normalizePartyIdentities({ intakeText: TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE }),
      );
      const restored = fromRecipientMetadata(meta);
      expect(restored).toHaveLength(3);
      expect(restored.map((p) => p.partyId)).toEqual(meta.partyIds);
    });
  });

  it("exports a non-empty two-party assumptions audit list", () => {
    expect(REMAINING_TWO_PARTY_ASSUMPTIONS_AUDIT.length).toBeGreaterThan(10);
    expect(
      REMAINING_TWO_PARTY_ASSUMPTIONS_AUDIT.some((e) => e.assumption.includes("recipient")),
    ).toBe(true);
  });
});

function TWO_PARTY_WITNESS_CORPUS(): string {
  return `IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
${PAID_PRO_HARDENING_CLIENT}
By: _________________________
Name: _________________________
Title: _________________________
Email for Notices: _________________________
Address for Notices: _________________________

SERVICE PROVIDER:
${PAID_PRO_HARDENING_PROVIDER}
By: _________________________
Name: _________________________
Title: _________________________
Email for Notices: _________________________
Address for Notices: _________________________`;
}
