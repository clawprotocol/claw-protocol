import { describe, expect, it } from "vitest";
import {
  extractAgreementEntityCandidates,
  resolvePartyNameForUserFacing,
  substitutePartyPlaceholdersInUserFacingText,
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

  it("replaces bare ORG_1 with inferred party", () => {
    const ctx = "Parties: Delta LLC, Epsilon Co";
    expect(resolvePartyNameForUserFacing("ORG_1", 0, ctx)).toBe("Delta LLC");
    expect(resolvePartyNameForUserFacing("org_2", 1, ctx)).toBe("Epsilon Co");
  });
});
