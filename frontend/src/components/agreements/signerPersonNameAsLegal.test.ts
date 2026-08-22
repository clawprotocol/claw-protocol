import { describe, expect, it } from "vitest";
import {
  resolvePaidProSignerDetailsGate,
  resolveSignerSetupPartyIdentities,
} from "./signerSetupPartyIdentity";

describe("casual two-party signer legal name (live Mike-paint)", () => {
  const identities = resolveSignerSetupPartyIdentities({
    parties: [{ name: "Client" }, { name: "Contractor" }],
    intakeText: "I hired Mike to paint my office. We shook on it.",
  });

  it("uses signer name Mike when Party 2 legal slot is only a role", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: "I hired Mike to paint my office. We shook on it.",
      signerSetupPartyIdentities: identities,
      draftPartyNames: ["Client", "Contractor"],
      partySignerNames: ["Anthem Blanchard", "Mike"],
      recipient1Name: "Anthem Blanchard",
      recipient2Name: "",
      recipient1Email: "anthem+lawdog-walk3@example.com",
      recipient2Email: "mike+lawdog-walk3@example.com",
      extraPartyReviewEmails: [],
    });
    expect(gate.legalEntityNames[1]).toBe("Mike");
    expect(gate.complete).toBe(true);
    expect(gate.blockerMessage).toBe("");
  });

  it("still blocks when Party 2 has no person name", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      intakeText: "I hired Mike to paint my office. We shook on it.",
      signerSetupPartyIdentities: identities,
      draftPartyNames: ["Client", "Contractor"],
      partySignerNames: ["Anthem Blanchard", ""],
      recipient1Name: "Anthem Blanchard",
      recipient2Name: "",
      recipient1Email: "anthem+lawdog-walk3@example.com",
      recipient2Email: "mike+lawdog-walk3@example.com",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockerMessage).toBe(
      "Confirm the legal name for Party 2 before adding signer details.",
    );
  });
});
