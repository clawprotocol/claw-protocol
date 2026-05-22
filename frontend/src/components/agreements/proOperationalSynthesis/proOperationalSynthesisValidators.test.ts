import { describe, expect, it } from "vitest";
import {
  findAgreementExecutionRegionStart,
  normalizeLegalEntityNameForMatch,
  textContainsLegalEntityName,
} from "../agreementExecutionRegion";
import { LAWDOG_ESIGN_CLAUSE } from "../premiumExecutionNormalization";
import { assertSignatureFullNames } from "./proOperationalSynthesisValidators";

describe("agreementExecutionRegion", () => {
  it("does not anchor on operative 'signature process' prose", () => {
    const body = [
      "KEY CONTACTS",
      "Guild Collective LLC",
      "Email: ops@guild.com",
      LAWDOG_ESIGN_CLAUSE,
    ].join("\n\n");
    const idx = findAgreementExecutionRegionStart(body);
    expect(body.slice(idx)).toContain("LawDog workflow");
    expect(body.slice(idx)).not.toMatch(/^signature process/i);
  });

  it("normalizes Inc. vs Inc entity suffixes", () => {
    expect(normalizeLegalEntityNameForMatch("Riverstone Co-Working Inc.")).toBe(
      normalizeLegalEntityNameForMatch("Riverstone Co-Working Inc"),
    );
    expect(textContainsLegalEntityName("Riverstone Co-Working Inc", "Riverstone Co-Working Inc.")).toBe(
      true,
    );
  });
});

describe("assertSignatureFullNames", () => {
  it("accepts LawDog execution footer when full names are in KEY CONTACTS", () => {
    const text = [
      "OPENING among Guild and Riverstone.",
      "KEY CONTACTS",
      "Guild Collective LLC",
      "Email: ops@guild.com",
      "Riverstone Co-Working Inc.",
      "Email: legal@riverstone.com",
      LAWDOG_ESIGN_CLAUSE,
    ].join("\n\n");
    expect(assertSignatureFullNames(text, ["Guild Collective LLC", "Riverstone Co-Working Inc."])).toEqual(
      [],
    );
  });

  it("still flags wet-signature blocks that only use shorts without full names above", () => {
    const text = [
      "1. PARTIES",
      "- Vendor LLC and Client Inc.",
      "IN WITNESS WHEREOF",
      "Vendor",
      "By: ___________________",
      "Client",
      "By: ___________________",
    ].join("\n");
    const issues = assertSignatureFullNames(text, ["Nimbus Cloud Systems LLC", "Orbit Retail Inc."]);
    expect(issues.some((i) => i.code === "signature_short_names")).toBe(true);
  });
});
