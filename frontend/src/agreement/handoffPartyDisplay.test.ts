import { describe, expect, it } from "vitest";
import type { AgreementParty } from "./agreementTypes";
import {
  formatAuthoritativeAgreementPartiesHeadline,
  formatAuthoritativeAgreementPartiesInline,
  formatReviewerRecipientsInline,
  orderedAuthoritativePartyDisplayNames,
  orderedReviewerRecipientLabels,
} from "./handoffPartyDisplay";

const FIVE_PARTY_NAMES = [
  "FoundryCo Inc.",
  "Beacon Operations And Logistics Group LLC",
  "Apollo Data Services LLC",
  "Smith & Wesson Holdings LLC",
  "Coastal Reserve Partners LP",
] as const;

function partiesFromNames(names: readonly string[]): AgreementParty[] {
  return names.map((name, i) => ({
    id: `p_${i}`,
    name,
    role: i === 0 ? "owner" : "party",
  }));
}

describe("handoffPartyDisplay — authoritative agreement parties", () => {
  it("preserves all five canonical names in order (multi-party handoff regression)", () => {
    const parties = partiesFromNames(FIVE_PARTY_NAMES);
    expect(orderedAuthoritativePartyDisplayNames(parties)).toEqual([...FIVE_PARTY_NAMES]);
    const headline = formatAuthoritativeAgreementPartiesHeadline(parties);
    expect(headline).not.toMatch(/↔/);
    expect(headline.split(" · ").length).toBe(5);
    expect(headline).toContain("Smith & Wesson Holdings LLC");
  });

  it("uses ↔ only for exactly two parties", () => {
    const two = partiesFromNames(["Alpha LLC", "Beta LLC"]);
    expect(formatAuthoritativeAgreementPartiesHeadline(two)).toBe("Alpha LLC ↔ Beta LLC");
  });

  it("caps inline tail with +N more when maxShown exceeded", () => {
    const many = partiesFromNames(["A", "B", "C", "D", "E"]);
    const s = formatAuthoritativeAgreementPartiesInline(many, { maxShown: 2, separator: " · " });
    expect(s).toContain("+3 more");
  });

  it("reviewer rows stay separate from party headline copy", () => {
    const rows = [{ email: "rev@example.com", name: "Pat Reviewer" }];
    expect(orderedReviewerRecipientLabels(rows)).toEqual(["Pat Reviewer (rev@example.com)"]);
    expect(formatReviewerRecipientsInline(rows)).toContain("rev@example.com");
  });
});
