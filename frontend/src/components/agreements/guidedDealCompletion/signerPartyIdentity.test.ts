import { describe, expect, it } from "vitest";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
  agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup,
  formatSignerPartyIdentityConfirmationLines,
  isIndividualPartyName,
  resolveCanonicalPartyIdentitiesFromSignerSetup,
  resolvePaidProPolishPartyNamesFromIdentities,
} from "./signerPartyIdentity";

const PLACEHOLDER_BODY = `LawDog is not a law firm.
Not legal advice.

This Services Agreement is entered into between [Your Company Name] and [Service Provider Name].

1. Services
Provider delivers services to Client.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
[Your Company Name]
By: __________________________
Name: ________________________
Title: _________________________
Date: _________________________

SERVICE PROVIDER:
[Service Provider Name]
By: __________________________
Name: ________________________
Title: _________________________
Date: _________________________
`;

describe("signerPartyIdentity (test26)", () => {
  const signerArgs = {
    partyCount: 2,
    partySignerNames: ["", ""],
    recipient1Name: "Anthem H Blanchard",
    recipient2Name: "Joe Smith",
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "joesmith328@me.com",
    extraPartyReviewEmails: [] as string[],
    draftPartyNames: ["Party A", "Party B"],
    sendMode: "review" as const,
    recipientsDeferred: false,
    draftPartyRoles: ["Client", "Service Provider"],
  };

  it("resolves human names as party display names (not link-only)", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    expect(ids[0].partyDisplayName).toBe("Anthem H Blanchard");
    expect(ids[1].partyDisplayName).toBe("Joe Smith");
    expect(ids[0].email).toBe("anthemhayek@gmail.com");
    expect(ids[1].email).toBe("joesmith328@me.com");
    expect(resolvePaidProPolishPartyNamesFromIdentities(ids)).toEqual([
      "Anthem H Blanchard",
      "Joe Smith",
    ]);
  });

  it("applies identities to corpus: removes bracket placeholders and fills signature names", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    const { text } = applySignerPartyIdentityToAuthoritativeAgreement(
      PLACEHOLDER_BODY,
      ids,
      "Between Client and Service Provider.",
    );
    expect(text).not.toMatch(/\[Your Company Name\]/i);
    expect(text).not.toMatch(/\[Service Provider Name\]/i);
    expect(text).toContain("Anthem H Blanchard");
    expect(text).toContain("Joe Smith");
    expect(text).not.toMatch(/^name\s*:\s*_{6,}/im);
    expect(text).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(text).toMatch(/Name:\s*Joe Smith/i);
    expect(agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup(text)).toBe(false);
  });

  it("confirmation lines list parties with emails", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    const lines = formatSignerPartyIdentityConfirmationLines(ids);
    expect(lines.join("\n")).toContain("Client: Anthem H Blanchard anthemhayek@gmail.com");
    expect(lines.join("\n")).toContain("Service Provider: Joe Smith joesmith328@me.com");
  });

  it("entity party keeps separate representative when display is entity", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Acme LLC",
      partySignerNames: ["Jane Doe", ""],
      draftPartyRoles: ["Client", "Service Provider"],
    });
    expect(ids[0].partyDisplayName).toBe("Acme LLC");
    expect(ids[0].representativeName).toBe("Jane Doe");
    expect(ids[0].isIndividual).toBe(false);
  });

  it("individual party detection", () => {
    expect(isIndividualPartyName("Anthem H Blanchard")).toBe(true);
    expect(isIndividualPartyName("Acme LLC")).toBe(false);
    expect(isIndividualPartyName("Party A")).toBe(false);
  });

  it("logs signer-party-identity-applied-to-corpus in non-test env path", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    const { signaturePolishCount } = applySignerPartyIdentityToAuthoritativeAgreement(
      PLACEHOLDER_BODY,
      ids,
      "",
    );
    expect(signaturePolishCount).toBeGreaterThan(0);
  });
});
