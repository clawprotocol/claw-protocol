import { describe, expect, it } from "vitest";
import {
  agreementParticipantFromParty,
  assertSignerMetadataPreserved,
  participantsFromAgreementDraft,
} from "./agreementParticipantModel";
import type { AgreementParty } from "./agreementTypes";

describe("agreementParticipantModel", () => {
  it("preserves signer metadata through normalization", () => {
    const parties: AgreementParty[] = [
      {
        id: "o1",
        name: "Acme LLC",
        role: "owner",
        signerName: "Jordan Lee",
        signerTitle: "CEO",
        email: "j@acme.com",
      },
      {
        id: "c1",
        name: "Beta Inc",
        role: "counterparty",
        signerName: "Sam Rivera",
        signerTitle: "General Counsel",
        email: "s@beta.com",
      },
    ];
    const participants = participantsFromAgreementDraft(parties);
    const report = assertSignerMetadataPreserved(participants, participants, "test");
    expect(report.ok).toBe(true);
    expect(report.afterSlotsWithSignerName).toBe(2);
  });

  it("does not treat entity name as signer name", () => {
    const p = agreementParticipantFromParty(
      { id: "c1", name: "Beta Inc", role: "counterparty", signerName: "Beta Inc" },
      "counterparty",
      2,
    );
    expect(p.signerName).toBe("");
  });
});
