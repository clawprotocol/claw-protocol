import { describe, expect, it } from "vitest";
import {
  evaluateGuidedSigningPacketGate,
  formatGuidedSigningConfirmationSignerLines,
} from "./guidedSigningConfirmation";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";

describe("guidedSigningConfirmation (test27)", () => {
  it("blocks when signers incomplete or body missing", () => {
    expect(
      evaluateGuidedSigningPacketGate({
        signersComplete: false,
        authoritativeBodyLen: 6000,
      }).reason,
    ).toBe("signers_incomplete");
    expect(
      evaluateGuidedSigningPacketGate({
        signersComplete: true,
        authoritativeBodyLen: 100,
      }).reason,
    ).toBe("authoritative_body_missing");
    expect(
      evaluateGuidedSigningPacketGate({
        signersComplete: true,
        authoritativeBodyLen: 13127,
        partyPlaceholdersUnresolved: true,
      }).reason,
    ).toBe("party_placeholders_unresolved");
    expect(
      evaluateGuidedSigningPacketGate({
        signersComplete: true,
        authoritativeBodyLen: 13127,
      }).ok,
    ).toBe(true);
  });

  it("formats signer lines for confirmation list", () => {
    const ids: CanonicalPartyIdentity[] = [
      {
        index: 0,
        partyDisplayName: "Acme LLC",
        email: "a@acme.com",
        representativeName: "Jane Doe",
        title: "CEO",
        blockHeading: "CLIENT",
        isIndividual: false,
      },
    ];
    const lines = formatGuidedSigningConfirmationSignerLines(ids);
    expect(lines.some((l) => l.includes("Acme"))).toBe(true);
  });
});
