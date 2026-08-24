import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  TEST479_FOUR_PARTY,
  TEST479_FOUR_PARTY_INTAKE,
  TEST479_FOUR_PARTY_LEGAL_ENTITIES,
  test479Draft,
} from "./paidProTest479Fixtures";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
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

  it("restores intake-authoritative parties when a model appends scope to a legal name", () => {
    const intake =
      "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";
    const parties = resolvePartiesForReviewRender({
      intakeText: intake,
      draft: {
        title: "Services Agreement",
        jurisdiction: "Texas",
        parties: [
          { name: "Priya Shah of Northline Studio", role: "client" },
          {
            name: "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
            role: "service_provider",
          },
        ],
        purpose: "design a logo and brand kit",
        payment_terms: "$2,400 due on signing",
        duration: "30 days starting August 22, 2026",
        due_date: null,
        effective_date: null,
        payment: { amount: 2400, cadence: "on signing", valid: true },
      },
    });

    expect(parties.map((party) => party.partyLegalName)).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);
    expect(parties.map((party) => party.signerEmail)).toEqual(["", ""]);
    expect(parties.map((party) => party.signerName)).toEqual(["", ""]);
  });

  it("keeps correctly entered signer metadata on its matching authority slot", () => {
    const intake =
      "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";
    setPaidProReviewSignerMetadataSessionActive(true);
    const parties = resolvePartiesForReviewRender({
      intakeText: intake,
      liveSignerMetadataUi: {
        partyCount: 2,
        recipient1Name: "Priya Shah of Northline Studio",
        recipient2Name: "Diego Alvarez of Harbor Marks LLC",
        recipient1Email: "priya.shah.qa@example.com",
        recipient2Email: "diego.alvarez.qa@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Priya Shah", "Diego Alvarez"],
        partySignerTitles: ["Owner", "Designer"],
        partyAddresses: ["Austin, Texas", "Houston, Texas"],
      },
    });

    expect(parties.map((party) => party.partyLegalName)).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);
    expect(parties.map((party) => party.signerEmail)).toEqual([
      "priya.shah.qa@example.com",
      "diego.alvarez.qa@example.com",
    ]);
    expect(parties.map((party) => party.signerName)).toEqual(["Priya Shah", "Diego Alvarez"]);
  });

  it("does not strip four-party consumed signer metadata during review render", () => {
    clearConsumedPaidProSignerMetadataAuthority();
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const draft = {
      ...test479Draft(),
      parties: TEST479_FOUR_PARTY_LEGAL_ENTITIES.map((name) => ({ name, role: "party" })),
    };
    runPaidProSignerMetadataAuthoritySeed({
      stage: "review_render_four_party",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: intake,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: ["", "", "", ""],
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });

    const parties = resolvePartiesForReviewRender({ draft, intakeText: intake });

    expect(parties.map((party) => party.partyLegalName)).toEqual(TEST479_FOUR_PARTY_LEGAL_ENTITIES);
    expect(parties.map((party) => party.signerName)).toEqual(
      TEST479_FOUR_PARTY.map((party) => party.signerName),
    );
    expect(parties.map((party) => party.signerEmail)).toEqual(
      TEST479_FOUR_PARTY.map((party) => party.email),
    );
  });
});
