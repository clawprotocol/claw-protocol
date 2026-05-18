import { describe, expect, it } from "vitest";
import type { AgreementParty } from "./agreementTypes";
import {
  DEFAULT_SIGNATURE_PARTY_FALLBACK,
  extractAgreementParties,
} from "./extractAgreementParties";

const QA_SAAS_RESELLER_INTAKE = `Create a SaaS reseller and white-label services agreement between Redwood Peak Ventures LLC, Atlas Harbor Technologies Inc., Meridian Workforce Group LLC, Prairie Signal Holdings LP, and NovaGrid Systems LLC. Scope includes white-label deployment of workflow automation software.`;

const FIVE_PARTY_NAMES = [
  "Redwood Peak Ventures LLC",
  "Atlas Harbor Technologies Inc.",
  "Meridian Workforce Group LLC",
  "Prairie Signal Holdings LP",
  "NovaGrid Systems LLC",
] as const;

function partiesFromNames(names: readonly string[]): AgreementParty[] {
  return names.map((name, i) => ({
    id: `p_${i}`,
    name,
    role: i === 0 ? "owner" : "party",
  }));
}

describe("extractAgreementParties", () => {
  it("returns five signature parties for SaaS reseller intake prompt", () => {
    const names = extractAgreementParties({ intakeText: QA_SAAS_RESELLER_INTAKE });
    expect(names).toHaveLength(5);
    expect(names).toEqual([...FIVE_PARTY_NAMES]);
  });

  it("returns two parties for a two-party structured draft", () => {
    const names = extractAgreementParties({
      parties: partiesFromNames(["Alpha LLC", "Beta Inc."]),
    });
    expect(names).toEqual(["Alpha LLC", "Beta Inc."]);
  });

  it("falls back to Party A / Party B when nothing is detected", () => {
    expect(extractAgreementParties({})).toEqual([...DEFAULT_SIGNATURE_PARTY_FALLBACK]);
    expect(
      extractAgreementParties({
        parties: partiesFromNames(["Party A", "Party B"]),
      }),
    ).toEqual([...DEFAULT_SIGNATURE_PARTY_FALLBACK]);
  });

  it("dedupes duplicate party names while preserving order", () => {
    const names = extractAgreementParties({
      parties: partiesFromNames(["Acme LLC", "Acme LLC", "Beta LLC"]),
      intakeText: "between Acme LLC and Beta LLC",
    });
    expect(names).toEqual(["Acme LLC", "Beta LLC"]);
  });

  it("prefers structured draft parties over intake when both are present", () => {
    const names = extractAgreementParties({
      parties: partiesFromNames(FIVE_PARTY_NAMES),
      intakeText: "between Acme LLC and Beta LLC only",
    });
    expect(names).toEqual([...FIVE_PARTY_NAMES]);
  });
});
