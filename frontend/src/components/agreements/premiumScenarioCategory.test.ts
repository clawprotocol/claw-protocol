import { describe, expect, it } from "vitest";
import { detectPremiumScenarioCategory, premiumScenarioPrefersLeanPacks } from "./premiumScenarioCategory";

describe("detectPremiumScenarioCategory", () => {
  it("routes roommate / lease to property_roommate", () => {
    const r = detectPremiumScenarioCategory(
      "Roommate agreement for 2BR apartment, split utilities and security deposit.",
      "generic_business_agreement",
    );
    expect(r.category).toBe("property_roommate");
    expect(r.signals).toContain("property");
  });

  it("routes promissory note to loan_payment", () => {
    const r = detectPremiumScenarioCategory(
      "Personal loan $5k from Alex to Jordan, 12 monthly installments, 5% APR, promissory note.",
      "",
    );
    expect(r.category).toBe("loan_payment");
  });

  it("routes employment signals before freelancer", () => {
    const r = detectPremiumScenarioCategory(
      "Offer letter: full-time employee salary $90k, benefits, at-will employment in California.",
      "services_agreement",
    );
    expect(r.category).toBe("employment");
  });

  it("marks short intake as custom_mixed", () => {
    expect(detectPremiumScenarioCategory("short", "").category).toBe("custom_mixed");
  });
});

describe("premiumScenarioPrefersLeanPacks", () => {
  it("is true for personal / housing / employment paths", () => {
    expect(premiumScenarioPrefersLeanPacks("family_personal")).toBe(true);
    expect(premiumScenarioPrefersLeanPacks("business_commercial")).toBe(false);
  });
});
