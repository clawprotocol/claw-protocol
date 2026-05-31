import { describe, expect, it } from "vitest";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
  agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup,
  formatSignerPartyIdentityConfirmationLines,
  isIndividualPartyName,
  resolveCanonicalPartyIdentitiesFromSignerSetup,
  resolvePaidProPolishPartyNamesFromIdentities,
  shouldRejectSignerIdentityCorpusShrink,
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

  it("hydrates distinct Name/Title per party when signature blocks use legal entity headings only", () => {
    const body = [
      "MASTER SERVICES AGREEMENT",
      "",
      "Between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
      "",
      ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
      "Date: _________________________",
      "",
      "Iron Vale Systems Inc.",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
      "Date: _________________________",
    ].join("\n");
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Blue Canyon Analytics LLC",
      recipient2Name: "Iron Vale Systems Inc.",
      partySignerNames: ["Anthem H Blanchard", "Jay Ive"],
      partySignerTitles: ["Member", "Member"],
      draftPartyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    const { text } = applySignerPartyIdentityToAuthoritativeAgreement(body, ids, "");
    const ironTail = text.split(/Iron Vale Systems Inc\./i).pop() ?? "";
    expect(text).toMatch(/Blue Canyon[\s\S]*Name:\s*Anthem H Blanchard/i);
    expect(text).toMatch(/Title:\s*Member/i);
    expect(ironTail).toMatch(/Name:\s*Jay Ive/i);
    expect(ironTail).not.toMatch(/Anthem H Blanchard/);
  });

  it("entity party 1 and individual party 2 get distinct signature Name lines (test30)", () => {
    const entityBody = `${PLACEHOLDER_BODY.replace("[Your Company Name]", "Acme LLC").replace("[Service Provider Name]", "Joe Smith")}`;
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
    });
    expect(ids[0].partyDisplayName).toBe("Acme LLC");
    expect(ids[0].representativeName).toBe("Anthem Blanchard");
    expect(ids[1].partyDisplayName).toBe("Joe Smith");
    expect(ids[1].isIndividual).toBe(true);
    const { text } = applySignerPartyIdentityToAuthoritativeAgreement(
      entityBody,
      ids,
      "Between Acme LLC and Joe Smith.",
    );
    const clientNameIdx = text.search(/CLIENT:[\s\S]*?Name:\s*Anthem Blanchard/i);
    const providerNameIdx = text.search(/SERVICE PROVIDER:[\s\S]*?Name:\s*Joe Smith/i);
    expect(clientNameIdx).toBeGreaterThan(-1);
    expect(providerNameIdx).toBeGreaterThan(-1);
    expect(text).not.toMatch(/SERVICE PROVIDER:[\s\S]*?Name:\s*Acme LLC/i);
  });

  it("replaces Party A / Party B slot labels when Acme LLC and Joe Brown are known", () => {
    const body = `AI AUTOMATION SERVICES AGREEMENT

This agreement is between Party A and Party B for AI automation workflows and dashboards.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Party A
By: __________________________
Name: ________________________
Title: _________________________
Date: _________________________

SERVICE PROVIDER:
Party B
By: __________________________
Name: ________________________
Date: _________________________
`;
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Brown",
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      draftPartyNames: ["Party A", "Party B"],
    });
    const { text } = applySignerPartyIdentityToAuthoritativeAgreement(
      body,
      ids,
      "agreement for somebody helping us with AI automation workflows and dashboards",
    );
    expect(text).toContain("between Acme LLC");
    expect(text).toContain("Joe Brown");
    expect(text).not.toMatch(/\bParty\s+A\b/i);
    expect(text).not.toMatch(/\bParty\s+B\b/i);
    expect(text).toMatch(/CLIENT:[\s\S]*Acme LLC/i);
    expect(text).toMatch(/SERVICE PROVIDER:[\s\S]*Joe Brown/i);
  });

  it("patches generic opening party labels with known party names before signing", () => {
    const body = `MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into by and between Client and Service Provider.

1. Services
The Client may request automation services from the Service Provider.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
By: __________________________
Name: ________________________
Title: _________________________
Date: _________________________

SERVICE PROVIDER:
By: __________________________
Name: ________________________
Title: _________________________
Date: _________________________
`;
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      partySignerNames: ["Anthem Blanchard", "Joe Smith"],
      partySignerTitles: ["Manager", ""],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
    });
    const { text } = applySignerPartyIdentityToAuthoritativeAgreement(
      body,
      ids,
      "Between Acme LLC and Joe Smith.",
    );
    const opening = text.slice(0, 300);
    expect(opening).toContain('between Acme LLC ("Client") and Joe Smith ("Service Provider")');
    expect(opening).not.toMatch(/between\s+Client\s+and\s+Service Provider/i);
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

  it("test35: ignores draft template placeholders when recipient names are set", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup({
      ...signerArgs,
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      partySignerNames: ["Anthem H Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      draftPartyNames: ["[Your Company Name]", "[Service Provider Name]"],
    });
    expect(ids[0].partyDisplayName).toBe("Acme LLC");
    expect(ids[0].representativeName).toBe("Anthem H Blanchard");
    expect(ids[1].partyDisplayName).toBe("Joe Smith");
    const lines = formatSignerPartyIdentityConfirmationLines(ids);
    expect(lines.join("\n")).not.toContain("[Your Company Name]");
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

  it("test28: preserves full corpus when EXECUTION appears early in operative text", () => {
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    const operative = "The execution of this Agreement and electronic signature laws apply.\n\n";
    const mid =
      "1. Services\nProvider delivers services.\n2. Payment\nFees as stated.\n3. Term\nOne year.\n".repeat(120);
    const sig = `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
[Your Company Name]
By: __________________________
Name: ________________________
Title: _________________________

SERVICE PROVIDER:
[Service Provider Name]
By: __________________________
Name: ________________________
Title: _________________________
`;
    const fullBody = operative + mid + sig;
    expect(fullBody.length).toBeGreaterThan(8000);
    const result = applySignerPartyIdentityToAuthoritativeAgreement(
      fullBody,
      ids,
      "Between Client and Service Provider.",
    );
    expect(result.rejected).not.toBe(true);
    expect(result.text.length).toBeGreaterThan(fullBody.length * 0.8);
    expect(result.text).toContain("1. Services");
    expect(result.text).toContain("Anthem H Blanchard");
  });

  it("test28: rejects shrunken identity output and returns original body", () => {
    expect(shouldRejectSignerIdentityCorpusShrink(8856, 449)).toBe(true);
    const ids = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
    const tiny = "x".repeat(2000);
    const result = applySignerPartyIdentityToAuthoritativeAgreement(tiny, ids, "");
    expect(result.text.length).toBeGreaterThanOrEqual(2000 * 0.8);
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
