import { describe, expect, it } from "vitest";
import { FORBIDDEN_PUBLIC_CLAIMS } from "./pricingContent";
import {
  assertPricingCopyHasNoForbiddenClaims,
  launchPricingCopyForComplianceTest,
  PRICING_FAQ,
  LAUNCH_PRICING_TIERS,
  PRICING_PROOF_CALLOUT,
} from "./pricingTiersData";

describe("launch pricing compliance", () => {
  it("aggregated pricing blob excludes forbidden promotional claims", () => {
    const blob = launchPricingCopyForComplianceTest();
    expect(() => assertPricingCopyHasNoForbiddenClaims(blob)).not.toThrow();
  });

  it("tier and FAQ strings stay non-empty for snapshot stability", () => {
    expect(LAUNCH_PRICING_TIERS).toHaveLength(3);
    for (const t of LAUNCH_PRICING_TIERS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.bullets.length).toBeGreaterThan(0);
    }
    expect(PRICING_FAQ.length).toBeGreaterThan(0);
    expect(PRICING_PROOF_CALLOUT.length).toBeGreaterThan(20);
  });

  it("FORBIDDEN_PUBLIC_CLAIMS list stays non-empty guardrail", () => {
    expect(FORBIDDEN_PUBLIC_CLAIMS.length).toBeGreaterThan(3);
  });
});
