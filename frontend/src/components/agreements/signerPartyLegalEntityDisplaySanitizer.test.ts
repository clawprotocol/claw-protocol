import { describe, expect, it } from "vitest";
import {
  hasSignerPartyLegalEntityLeadingVerbPollution,
  isCleanSignerPartyLegalEntityDisplay,
  sanitizeSignerPartyLegalEntityDisplay,
} from "./signerPartyLegalEntityDisplaySanitizer";

describe("signerPartyLegalEntityDisplaySanitizer", () => {
  it("strips leading engages from polluted Party 2 legal entity display", () => {
    expect(sanitizeSignerPartyLegalEntityDisplay("engages Iron Vale Systems Inc", { log: false })).toBe(
      "Iron Vale Systems Inc",
    );
  });

  it("leaves Blue Canyon Analytics LLC unchanged", () => {
    expect(sanitizeSignerPartyLegalEntityDisplay("Blue Canyon Analytics LLC", { log: false })).toBe(
      "Blue Canyon Analytics LLC",
    );
  });

  it("strips hires, retains, and contracts with prefixes", () => {
    expect(sanitizeSignerPartyLegalEntityDisplay("hires Acme LLC", { log: false })).toBe("Acme LLC");
    expect(sanitizeSignerPartyLegalEntityDisplay("retains Beta Corp", { log: false })).toBe("Beta Corp");
    expect(sanitizeSignerPartyLegalEntityDisplay("contracts with Gamma Ltd", { log: false })).toBe("Gamma Ltd");
    expect(sanitizeSignerPartyLegalEntityDisplay("between and engages Delta Inc", { log: false })).toBe("Delta Inc");
  });

  it("detects verb pollution and clean entity suffixes", () => {
    expect(hasSignerPartyLegalEntityLeadingVerbPollution("engages Iron Vale Systems Inc")).toBe(true);
    expect(hasSignerPartyLegalEntityLeadingVerbPollution("Iron Vale Systems Inc")).toBe(false);
    expect(isCleanSignerPartyLegalEntityDisplay("Blue Canyon Analytics LLC")).toBe(true);
    expect(isCleanSignerPartyLegalEntityDisplay("engages Iron Vale Systems Inc")).toBe(true);
  });
});
