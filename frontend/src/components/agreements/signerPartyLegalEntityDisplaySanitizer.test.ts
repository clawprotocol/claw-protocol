import { describe, expect, it } from "vitest";
import {
  hasSignerPartyLegalEntityDisplayPollution,
  hasTrailingJurisdictionClausePollution,
  isCleanSignerPartyLegalEntityDisplay,
  sanitizeSignerPartyLegalEntityDisplay,
  stripTrailingJurisdictionClause,
} from "./signerPartyLegalEntityDisplaySanitizer";

const PARTY_1 = "Blue Canyon Analytics LLC";
const PARTY_2 = "Iron Vale Systems Inc";

describe("signerPartyLegalEntityDisplaySanitizer", () => {
  it.each([
    ["engages Iron Vale Systems Inc", PARTY_2],
    ["1 Parties. Blue Canyon Analytics LLC", PARTY_1],
    ["1. Parties. Blue Canyon Analytics LLC", PARTY_1],
    ["1.1 Parties. Blue Canyon Analytics LLC", PARTY_1],
    ["Parties. Blue Canyon Analytics LLC", PARTY_1],
    ["Client is Blue Canyon Analytics LLC", PARTY_1],
    ["Service Provider is Iron Vale Systems Inc", PARTY_2],
  ])("strips polluted display %j → %j", (input, expected) => {
    expect(sanitizeSignerPartyLegalEntityDisplay(input, { log: false })).toBe(expected);
  });

  it("leaves clean legal entity names unchanged", () => {
    expect(sanitizeSignerPartyLegalEntityDisplay(PARTY_1, { log: false })).toBe(PARTY_1);
    expect(sanitizeSignerPartyLegalEntityDisplay(PARTY_2, { log: false })).toBe(PARTY_2);
  });

  it("strips hires, retains, and contracts with prefixes", () => {
    expect(sanitizeSignerPartyLegalEntityDisplay("hires Acme LLC", { log: false })).toBe("Acme LLC");
    expect(sanitizeSignerPartyLegalEntityDisplay("retains Beta Corp", { log: false })).toBe("Beta Corp");
    expect(sanitizeSignerPartyLegalEntityDisplay("contracts with Gamma Ltd", { log: false })).toBe("Gamma Ltd");
    expect(sanitizeSignerPartyLegalEntityDisplay("between and engages Delta Inc", { log: false })).toBe("Delta Inc");
  });

  it("detects heading/prose pollution and clean entity suffixes", () => {
    expect(hasSignerPartyLegalEntityDisplayPollution("engages Iron Vale Systems Inc")).toBe(true);
    expect(hasSignerPartyLegalEntityDisplayPollution("1 Parties. Blue Canyon Analytics LLC")).toBe(true);
    expect(hasSignerPartyLegalEntityDisplayPollution(PARTY_2)).toBe(false);
    expect(isCleanSignerPartyLegalEntityDisplay(PARTY_1)).toBe(true);
    expect(isCleanSignerPartyLegalEntityDisplay("engages Iron Vale Systems Inc")).toBe(true);
    expect(isCleanSignerPartyLegalEntityDisplay("1 Parties. Blue Canyon Analytics LLC")).toBe(true);
  });

  it("strips trailing jurisdiction prose accidentally merged into party labels", () => {
    expect(hasTrailingJurisdictionClausePollution("Jane Donaldson, Oklahoma law")).toBe(true);
    expect(hasTrailingJurisdictionClausePollution("Harbor Peak Automation LLC, Oklahoma law governs")).toBe(
      true,
    );
    expect(stripTrailingJurisdictionClause("Jane Donaldson, Oklahoma law")).toBe("Jane Donaldson");
    expect(stripTrailingJurisdictionClause("Harbor Peak Automation LLC, Oklahoma law governs")).toBe(
      "Harbor Peak Automation LLC",
    );
    expect(sanitizeSignerPartyLegalEntityDisplay("Jane Donaldson, Oklahoma law", { log: false })).toBe(
      "Jane Donaldson",
    );
    expect(
      sanitizeSignerPartyLegalEntityDisplay("Harbor Peak Automation LLC, Oklahoma law governs", {
        log: false,
      }),
    ).toBe("Harbor Peak Automation LLC");
    expect(hasSignerPartyLegalEntityDisplayPollution("Jane Donaldson, Oklahoma law")).toBe(true);
    expect(hasSignerPartyLegalEntityDisplayPollution("Jane Donaldson")).toBe(false);
  });
});
