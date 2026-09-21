import { describe, expect, it } from "vitest";
import type { AgreementParty } from "../agreement/agreementTypes";
import { countRequiredSignersFromParties } from "../agreement/resolveRequiredSignerCount";
import { partyRequiresSignature } from "../agreement/partyRequiresSignature";
import {
  formatOwnerSignedSignatureSummary,
  resolveSignedRecordDisplayTitle,
} from "./ownerSignedAgreementPresentation";
import {
  OWNER_SIGNED_COORDINATOR_EXCLUDED_PARTIES_SANITIZED,
  OWNER_SIGNED_FOUR_PARTY_CORPUS_SANITIZED,
  OWNER_SIGNED_FOUR_PARTY_PARTIES_SANITIZED,
  OWNER_SIGNED_NOTICE_ONLY_PARTY_SANITIZED,
  OWNER_SIGNED_THREE_PARTY_CORPUS_SANITIZED,
  OWNER_SIGNED_THREE_PARTY_PARTIES_SANITIZED,
  OWNER_SIGNED_TWO_PARTY_CORPUS_SANITIZED,
  OWNER_SIGNED_TWO_PARTY_PARTIES_SANITIZED,
} from "./fixtures/ownerSignedRecordPresentation.sanitized";

function asParties(rows: readonly { id: string; name: string; role: string; requiresSignature?: boolean }[]): AgreementParty[] {
  return rows.map((row) => ({ ...row }));
}

describe("resolveSignedRecordDisplayTitle", () => {
  it("prefers two-party corpus heading over a conflicting draft title", () => {
    const resolved = resolveSignedRecordDisplayTitle({
      draftTitle: "Joint Venture Agreement",
      corpusText: OWNER_SIGNED_TWO_PARTY_CORPUS_SANITIZED,
    });
    expect(resolved.source).toMatch(/^corpus-/);
    expect(resolved.title).toBe("Consulting Services Agreement");
  });

  it("prefers three-party corpus heading over a conflicting draft title", () => {
    const resolved = resolveSignedRecordDisplayTitle({
      draftTitle: "Joint Venture Agreement",
      corpusText: OWNER_SIGNED_THREE_PARTY_CORPUS_SANITIZED,
    });
    expect(resolved.source).toBe("corpus-title-line");
    expect(resolved.title).toBe("Intellectual Property License And Royalty Agreement");
  });

  it("prefers four-party corpus heading over a conflicting draft title", () => {
    const resolved = resolveSignedRecordDisplayTitle({
      draftTitle: "Joint Venture Agreement",
      corpusText: OWNER_SIGNED_FOUR_PARTY_CORPUS_SANITIZED,
    });
    expect(resolved.source).toBe("corpus-title-line");
    expect(resolved.title).toBe("Precision Medicine Data Platform Agreement");
  });

  it("falls back to the draft title only when the corpus has no heading", () => {
    const resolved = resolveSignedRecordDisplayTitle({
      draftTitle: "Consulting Agreement",
      corpusText: "The parties agree to the commercial terms already confirmed.",
    });
    expect(resolved.source).toBe("draft");
    expect(resolved.title).toBe("Consulting Agreement");
  });
});

describe("formatOwnerSignedSignatureSummary and required signer count", () => {
  it("shows two-party completion from reviewer-stamped legal parties, not 1 of 1", () => {
    const parties = asParties(OWNER_SIGNED_TWO_PARTY_PARTIES_SANITIZED);
    expect(countRequiredSignersFromParties(parties)).toBe(2);
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 1,
        signaturesRecorded: 2,
        fullyExecuted: true,
        parties,
      }),
    ).toBe("Fully signed (2 of 2)");
  });

  it("shows three-party completion without inferring required from completed count", () => {
    const parties = asParties(OWNER_SIGNED_THREE_PARTY_PARTIES_SANITIZED);
    expect(countRequiredSignersFromParties(parties)).toBe(3);
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 1,
        signaturesRecorded: 3,
        fullyExecuted: true,
        parties,
      }),
    ).toBe("Fully signed (3 of 3)");
  });

  it("shows four-party completion when public verify undercounts reviewer-stamped parties", () => {
    const parties = asParties(OWNER_SIGNED_FOUR_PARTY_PARTIES_SANITIZED);
    expect(countRequiredSignersFromParties(parties)).toBe(4);
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 1,
        signaturesRecorded: 4,
        fullyExecuted: true,
        parties,
      }),
    ).toBe("Fully signed (4 of 4)");
  });

  it("keeps an incomplete four-party record as recorded of required, not fully signed N of N", () => {
    const parties = asParties(OWNER_SIGNED_FOUR_PARTY_PARTIES_SANITIZED);
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 4,
        signaturesRecorded: 3,
        fullyExecuted: false,
        parties,
      }),
    ).toBe("3 of 4 signed");
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 1,
        signaturesRecorded: 3,
        fullyExecuted: true,
        parties,
      }),
    ).toBe("3 of 4 signed");
  });

  it("does not fabricate 1 of 1 when required information is missing", () => {
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: null,
        signaturesRecorded: 4,
        fullyExecuted: true,
        parties: [],
      }),
    ).toBe("Fully signed");
    expect(
      formatOwnerSignedSignatureSummary({
        signerPartyCount: 0,
        signaturesRecorded: 2,
        fullyExecuted: false,
        parties: [],
      }),
    ).toBe("2 signatures recorded");
  });

  it("excludes coordinators and explicit notice-only reviewers from required signers", () => {
    expect(countRequiredSignersFromParties(asParties(OWNER_SIGNED_COORDINATOR_EXCLUDED_PARTIES_SANITIZED))).toBe(2);
    expect(partyRequiresSignature({ ...OWNER_SIGNED_NOTICE_ONLY_PARTY_SANITIZED })).toBe(false);
    expect(
      countRequiredSignersFromParties([
        ...asParties(OWNER_SIGNED_TWO_PARTY_PARTIES_SANITIZED),
        { ...OWNER_SIGNED_NOTICE_ONLY_PARTY_SANITIZED },
      ]),
    ).toBe(2);
  });
});
