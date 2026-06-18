import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  resetPaidProReviewSignerMetadataSessionActiveForTests,
  setPaidProReviewSignerMetadataSessionActive,
} from "./paidProReviewRenderSessionGate";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Harbor Peak Automation LLC";

function consumedAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: "old@example.com",
    recipient2Email: "party2@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Thomas Bundy", "Nancy Mane"],
    partySignerTitles: ["CEO", "Member"],
    partyAddresses: ["123 Main", ""],
  });
}

describe("paidProReviewRenderParties", () => {
  beforeEach(() => {
    resetPaidProReviewSignerMetadataSessionActiveForTests();
    clearConsumedPaidProSignerMetadataAuthority();
    setConsumedPaidProSignerMetadataAuthority(consumedAuthority());
  });

  afterEach(() => {
    resetPaidProReviewSignerMetadataSessionActiveForTests();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("prefers consumed signer fields when metadata session is inactive", () => {
    const parties = resolvePartiesForReviewRender({
      liveSignerMetadataUi: {
        partyCount: 2,
        recipient1Name: RED,
        recipient2Name: BLUE,
        recipient1Email: "edited@example.com",
        recipient2Email: "party2@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Edited Name", "Nancy Mane"],
        partySignerTitles: ["President", "Member"],
        partyAddresses: ["456 New St", ""],
      },
    });
    expect(parties[0]?.signerEmail).toBe("old@example.com");
    expect(parties[0]?.signerName).toBe("Thomas Bundy");
    expect(parties[0]?.signerTitle).toBe("CEO");
  });

  it("prefers live signer fields during metadata edit session", () => {
    setPaidProReviewSignerMetadataSessionActive(true);
    const parties = resolvePartiesForReviewRender({
      liveSignerMetadataUi: {
        partyCount: 2,
        recipient1Name: RED,
        recipient2Name: BLUE,
        recipient1Email: "edited@example.com",
        recipient2Email: "party2@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Edited Name", "Nancy Mane"],
        partySignerTitles: ["President", "Member"],
        partyAddresses: ["456 New St", ""],
      },
    });
    expect(parties[0]?.signerEmail).toBe("edited@example.com");
    expect(parties[0]?.signerName).toBe("Edited Name");
    expect(parties[0]?.signerTitle).toBe("President");
    expect(parties[0]?.partyAddress).toBe("456 New St");
  });
});
