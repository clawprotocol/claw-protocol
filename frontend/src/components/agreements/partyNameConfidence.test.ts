import { describe, expect, it } from "vitest";
import {
  coercePartyNameForRecipientAutoFill,
  getSafeFallbackPartyLabels,
  isHighConfidencePartyNameForAutoPopulation,
  isProsePollutedPartyName,
  isRoleOnlyPlaceholderSignerName,
  isSeedableSignerNameFromDraftParty,
} from "./partyNameConfidence";

describe("isProsePollutedPartyName", () => {
  it("flags freelancer / client intake fragments", () => {
    expect(isProsePollutedPartyName(`two parties I'm a freelance designer working with a startup`)).toBe(true);
    expect(isProsePollutedPartyName(`need an agreement with a client for a retainer`)).toBe(true);
  });

  it("flags consultant / startup style prompts", () => {
    expect(isProsePollutedPartyName(`I need an NDA before sharing our roadmap with a vendor`)).toBe(true);
    expect(isProsePollutedPartyName(`I'm a consultant helping a startup with their data room`)).toBe(true);
  });

  it("flags contractor / homeowner narrative", () => {
    expect(
      isProsePollutedPartyName(`I run a small landscaping company and need something in writing with a homeowner`),
    ).toBe(true);
  });

  it("flags landlord / tenant request language", () => {
    expect(isProsePollutedPartyName(`need a lease addendum for my tenant about pets`)).toBe(true);
  });

  it("allows concise legal entities and person names", () => {
    expect(isProsePollutedPartyName("Acme Holdings LLC")).toBe(false);
    expect(isProsePollutedPartyName("Jane Q. Public")).toBe(false);
    expect(isProsePollutedPartyName("Peaceful Journey LLC")).toBe(false);
  });

  it("allows person-of-entity as one party, not dump prose", () => {
    expect(isProsePollutedPartyName("Priya Shah of Northline Studio")).toBe(false);
    expect(isProsePollutedPartyName("Diego Alvarez of Harbor Marks LLC")).toBe(false);
    expect(isHighConfidencePartyNameForAutoPopulation("Priya Shah of Northline Studio")).toBe(true);
    expect(isHighConfidencePartyNameForAutoPopulation("Diego Alvarez of Harbor Marks LLC")).toBe(true);
  });
});

describe("isHighConfidencePartyNameForAutoPopulation", () => {
  it("rejects multi-word prose without an entity suffix", () => {
    expect(isHighConfidencePartyNameForAutoPopulation("freelance designer based in Austin")).toBe(false);
  });

  it("allows up to four words without suffix", () => {
    expect(isHighConfidencePartyNameForAutoPopulation("Jean de la Cruz")).toBe(true);
  });

  it("allows longer firm names when a company suffix is present", () => {
    expect(isHighConfidencePartyNameForAutoPopulation("Smith Jones Johnson LLP")).toBe(true);
  });
});

describe("getSafeFallbackPartyLabels", () => {
  it("returns Service Provider / Client for service-style families", () => {
    expect(getSafeFallbackPartyLabels("consulting_agreement")).toEqual(["Service Provider", "Client"]);
    expect(getSafeFallbackPartyLabels("independent_contractor_agreement")).toEqual(["Service Provider", "Client"]);
  });

  it("defaults to Party A / Party B", () => {
    expect(getSafeFallbackPartyLabels(null)).toEqual(["Party A", "Party B"]);
    expect(getSafeFallbackPartyLabels("nda")).toEqual(["Party A", "Party B"]);
  });
});

describe("coercePartyNameForRecipientAutoFill", () => {
  it("passes through trusted names", () => {
    expect(coercePartyNameForRecipientAutoFill("Riley Chen", 0, null)).toBe("Riley Chen");
  });

  it("falls back per slot and family", () => {
    expect(coercePartyNameForRecipientAutoFill("I need an agreement with a client", 0, "consulting_agreement")).toBe(
      "Service Provider",
    );
    expect(coercePartyNameForRecipientAutoFill("I need an agreement with a client", 1, "consulting_agreement")).toBe(
      "Client",
    );
    expect(coercePartyNameForRecipientAutoFill("I need an agreement with a client", 1, null)).toBe("Party B");
  });
});

describe("isSeedableSignerNameFromDraftParty", () => {
  it("accepts real people and entities", () => {
    expect(isSeedableSignerNameFromDraftParty("Mike")).toBe(true);
    expect(isSeedableSignerNameFromDraftParty("Sarah")).toBe(true);
    expect(isSeedableSignerNameFromDraftParty("Jordan")).toBe(true);
    expect(isSeedableSignerNameFromDraftParty("Anthem")).toBe(true);
    expect(isSeedableSignerNameFromDraftParty("Red Mesa LLC")).toBe(true);
  });

  it("rejects role-only placeholders the visitor would have to delete", () => {
    expect(isRoleOnlyPlaceholderSignerName("Client")).toBe(true);
    expect(isRoleOnlyPlaceholderSignerName("Service Provider")).toBe(true);
    expect(isRoleOnlyPlaceholderSignerName("Party A")).toBe(true);
    expect(isRoleOnlyPlaceholderSignerName("Party 1")).toBe(true);
    expect(isSeedableSignerNameFromDraftParty("Client")).toBe(false);
    expect(isSeedableSignerNameFromDraftParty("Service Provider")).toBe(false);
    expect(isSeedableSignerNameFromDraftParty("Party A")).toBe(false);
  });

  it("rejects dump sentences and money or term fragments", () => {
    expect(isSeedableSignerNameFromDraftParty("I hired Mike to paint my office. We shook on it.")).toBe(false);
    expect(isSeedableSignerNameFromDraftParty("They Pay Monthly")).toBe(false);
    expect(isSeedableSignerNameFromDraftParty("$3k, Two Weeks")).toBe(false);
  });
});
