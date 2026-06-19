import { describe, expect, it } from "vitest";
import {
  extractIntakeDeclaredPartyRoleHints,
  isExtractionRoleAlias,
  isPreservableIntakeRole,
  replaceExtractionRoleAliasesInProse,
  resolveCanonicalPartyRoleLabel,
} from "./canonicalPartyRoleAuthority";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";

describe("canonicalPartyRoleAuthority", () => {
  it("maps contamination aliases to Client / Service Provider for two-party services", () => {
    expect(resolveCanonicalPartyRoleLabel({ partyIndex: 0, partyCount: 2, explicitRole: "hiring party" })).toBe(
      "Client",
    );
    expect(resolveCanonicalPartyRoleLabel({ partyIndex: 1, partyCount: 2, explicitRole: "consultant" })).toBe(
      "Service Provider",
    );
    expect(isExtractionRoleAlias("hiring party")).toBe(true);
    expect(isPreservableIntakeRole("buyer")).toBe(true);
    expect(isPreservableIntakeRole("hiring party")).toBe(false);
  });

  it("preserves user-declared commercial roles (Buyer, Vendor, Agency)", () => {
    expect(
      resolveCanonicalPartyRoleLabel({
        partyIndex: 0,
        partyCount: 2,
        explicitRole: "buyer",
        preserveIntakeRole: true,
      }),
    ).toBe("Buyer");
    expect(
      resolveCanonicalPartyRoleLabel({
        partyIndex: 1,
        partyCount: 2,
        explicitRole: "vendor",
        preserveIntakeRole: true,
      }),
    ).toBe("Vendor");
    expect(
      resolveCanonicalPartyRoleLabel({
        partyIndex: 0,
        partyCount: 2,
        explicitRole: "purchaser",
        preserveIntakeRole: true,
      }),
    ).toBe("Purchaser");
    expect(
      resolveCanonicalPartyRoleLabel({
        partyIndex: 1,
        partyCount: 2,
        explicitRole: "contractor",
        preserveIntakeRole: true,
      }),
    ).toBe("Contractor");
    expect(
      resolveCanonicalPartyRoleLabel({
        partyIndex: 1,
        partyCount: 2,
        explicitRole: "agency",
        preserveIntakeRole: true,
      }),
    ).toBe("Agency");
  });

  it("extracts is-the role declarations from intake", () => {
    const hints = extractIntakeDeclaredPartyRoleHints(
      "Blue Canyon Analytics LLC is the Buyer.\nIron Vale Systems Inc. is the Vendor.",
    );
    expect(hints["blue canyon analytics llc"]).toBe("buyer");
    expect(hints["iron vale systems inc."]).toBe("vendor");
  });

  it("replaces hiring party alias contamination in Pro prose", () => {
    const corpus = [
      "SCOPE",
      "hiring party will pay Service Provider $4,000 per month.",
      "hiring party Materials and Access shall be provided by Client.",
    ].join("\n");
    const repaired = repairFullAgreementPartyIdentity({
      text: corpus,
      intakeRaw: "Agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(repaired.text).not.toMatch(/hiring party/i);
    expect(repaired.text).toMatch(/Client will pay/i);
  });

  it("replaceExtractionRoleAliasesInProse handles hiring party phrases", () => {
    const out = replaceExtractionRoleAliasesInProse("hiring party grants access.", ["Client", "Service Provider"]);
    expect(out.text).toMatch(/Client grants access/i);
    expect(out.text).not.toMatch(/hiring party/i);
  });
});
