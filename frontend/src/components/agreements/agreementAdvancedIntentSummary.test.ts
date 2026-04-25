import { describe, expect, it } from "vitest";
import {
  getSimplifiedAdvancedLimitationCopy,
  getSimplifiedAdvancedUpgradeCtaCopy,
  SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE,
} from "./agreementAdvancedIntentSummary";

describe("getSimplifiedAdvancedLimitationCopy", () => {
  it("uses consulting + entity copy for Anthem / Peaceful Journey LLC consulting intake", () => {
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC";
    const r = getSimplifiedAdvancedLimitationCopy(raw, "consulting_agreement");
    expect(r.variant).toBe("consulting_entity");
    expect(r.text).toContain("service relationship");
    expect(r.text).toContain("not fully defined here");
  });

  it("prefers governance copy when operating / member structure dominates", () => {
    const raw = "LLC operating agreement for two members, capital accounts, and distributions.";
    const r = getSimplifiedAdvancedLimitationCopy(raw, "operating_agreement");
    expect(r.variant).toBe("governance_ownership");
    expect(r.text).toContain("governance mechanics");
  });

  it("uses commercial / risk copy for advanced payment and liability signals", () => {
    const raw = "Advisor agreement with earnout, liquidated damages, and custom indemnity carve-outs.";
    const r = getSimplifiedAdvancedLimitationCopy(raw, "generic_business_agreement");
    expect(r.variant).toBe("commercial_risk");
    expect(r.text).toContain("negotiated risk allocation");
  });

  it("falls back to general scope when no specific bucket matches", () => {
    const raw = "Simple two-party agreement to collaborate on a one-off project.";
    const r = getSimplifiedAdvancedLimitationCopy(raw, "generic_business_agreement");
    expect(r.variant).toBe("general");
    expect(r.text).toContain("covers the basics");
  });
});

describe("getSimplifiedAdvancedUpgradeCtaCopy", () => {
  it("prefers Unlock Complete Agreement for consulting + LLC", () => {
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC";
    const r = getSimplifiedAdvancedUpgradeCtaCopy(raw, "consulting_agreement");
    expect(r.variant).toBe("unlock_complete");
    expect(r.label).toBe("Unlock Complete Agreement");
    expect(r.trustLine).toBe(SIMPLIFIED_ADVANCED_UPGRADE_TRUST_LINE);
  });

  it("prefers Get Full Protections for liability / risk-heavy intakes", () => {
    const raw = "Advisor agreement with earnout, liquidated damages, and custom indemnity carve-outs.";
    const r = getSimplifiedAdvancedUpgradeCtaCopy(raw, "generic_business_agreement");
    expect(r.variant).toBe("full_protections");
    expect(r.label).toBe("Get Full Protections");
  });

  it("prefers Generate Full Agreement for general simplified cases", () => {
    const raw = "Simple two-party agreement to collaborate on a one-off project.";
    const r = getSimplifiedAdvancedUpgradeCtaCopy(raw, "generic_business_agreement");
    expect(r.variant).toBe("generate_full");
    expect(r.label).toBe("Generate Full Agreement");
  });
});
