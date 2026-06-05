import { describe, expect, it } from "vitest";
import {
  hasSignerPartyLegalEntityDisplayPollution,
  isCleanSignerPartyLegalEntityDisplay,
  sanitizeSignerPartyLegalEntityDisplay,
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
});
