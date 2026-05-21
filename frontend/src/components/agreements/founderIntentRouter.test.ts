import { describe, expect, it } from "vitest";
import {
  getResolvedTitleForFounderGating,
  hasRequiredFounderPremiumTitle,
  isFounderEquityVestingIntent,
} from "./founderIntentRouter";

describe("founderIntentRouter", () => {
  it("detects startup / 60-40 / vesting intent", () => {
    expect(isFounderEquityVestingIntent("We need 60/40 between two founders and a 4-year vest.")).toBe(true);
    expect(isFounderEquityVestingIntent("Simple NDA for two people about confidentiality only.")).toBe(false);
  });

  it("accepts any of the three required title phrases in body or title", () => {
    const doc = "Equity Vesting Agreement\n\nParty A and Party B…";
    expect(hasRequiredFounderPremiumTitle("", doc)).toBe(true);
    expect(hasRequiredFounderPremiumTitle("Founders Agreement", "preamble…")).toBe(true);
  });

  it("rejects generic agreement when required phrase missing", () => {
    const doc = "AGREEMENT\n\n1. The parties…";
    expect(hasRequiredFounderPremiumTitle("AGREEMENT", doc)).toBe(false);
  });

  it("getResolvedTitle reads first line when API title empty", () => {
    expect(getResolvedTitleForFounderGating("", "# Equity Vesting Agreement\n\nBody")).toBe("Equity Vesting Agreement");
  });

  it("does not treat founder-friendly contractor developer intake as founder vesting", () => {
    const intake =
      "Need a contractor agreement for a developer. They should own all their work product but we also need full exclusive ownership of everything they create. Month-to-month but lock in for 3 years. Need it simple and founder-friendly.";
    expect(isFounderEquityVestingIntent(intake)).toBe(false);
  });
});
