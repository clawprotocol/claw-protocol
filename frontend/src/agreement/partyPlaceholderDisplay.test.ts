import { describe, expect, it } from "vitest";
import {
  extractAgreementEntityCandidates,
  resolvePartyNameForUserFacing,
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "./partyPlaceholderDisplay";

describe("partyPlaceholderDisplay", () => {
  it("extracts names from between … and …", () => {
    const ctx = "This agreement is between Peaceful Journey LLC and Acme Corp for lawn care.";
    expect(extractAgreementEntityCandidates(ctx)).toEqual(
      expect.arrayContaining(["Peaceful Journey LLC", "Acme Corp"]),
    );
  });

  it("substitutes ORG_1 style tokens using context", () => {
    const ctx = "between Beta Inc and Gamma LLC";
    expect(substitutePartyPlaceholdersInUserFacingText("Services for ORG_1.", ctx)).toBe("Services for Beta Inc.");
    expect(substitutePartyPlaceholdersInUserFacingText("ORG_1 and org2 agree.", ctx)).toBe("Beta Inc and Gamma LLC agree.");
  });

  it("strips bracketed refs from mixed names", () => {
    const ctx = "between Peaceful Journey and Acme LLC";
    expect(resolvePartyNameForUserFacing("Peaceful Journey [ORG_1]", 0, ctx)).toBe("Peaceful Journey");
  });

  it("substitutes using authoritative ordered party list when provided", () => {
    const auth = ["Alpha LLC", "Beta LLC", "Gamma LLC"];
    expect(substitutePartyPlaceholdersInUserFacingText("Signer: [ORG_2].", "ignored", auth)).toBe("Signer: Beta LLC.");
    expect(substitutePartyPlaceholdersInUserFacingText("Mustache {{entity_3}}", "", auth)).toContain("Gamma");
    expect(textContainsUnresolvedIdentityPlaceholders("Signer: [ORG_2].")).toBe(true);
    expect(textContainsUnresolvedIdentityPlaceholders("Signer: Beta LLC.")).toBe(false);
  });

  it("dedupes Smith & prefix when token expands to full Smith & Wesson name", () => {
    const auth = ["A", "B", "C", "Smith & Wesson Holdings LLC", "E"];
    expect(substitutePartyPlaceholdersInUserFacingText("Line: Smith & [ORG_4].", "", auth)).toBe(
      "Line: Smith & Wesson Holdings LLC.",
    );
  });

  it("does not map out-of-range ORG slots to the last party inside prose (avoids Frankenstein merges)", () => {
    const auth = ["P1 LLC", "P2 LLC", "P3 LLC", "P4 LLC", "P5 LLC"];
    const out = substitutePartyPlaceholdersInUserFacingText("Between [ORG_1] and Beacon and [ORG_6].", "", auth);
    expect(out).toContain("P1 LLC");
    expect(out).toMatch(/\bParty\s+[A-Z]\b/);
    expect(out).not.toMatch(/P5 LLC\s*\./);
  });

  it("replaces bare ORG_1 with inferred party", () => {
    const ctx = "Parties: Delta LLC, Epsilon Co";
    expect(resolvePartyNameForUserFacing("ORG_1", 0, ctx)).toBe("Delta LLC");
    expect(resolvePartyNameForUserFacing("org_2", 1, ctx)).toBe("Epsilon Co");
  });
});
