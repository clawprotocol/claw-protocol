import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  resolvePremiumIntentPreflightPolicy,
  shouldEarlyNeedsDetailsForTierB,
} from "./premiumIntentPreflightPolicy";

describe("premium intent preflight policy", () => {
  it("logo/design resolves to tier A (aggressive server attempt profile)", () => {
    const c = resolveAgreementIntentContract("Need a logo contract for $1,500 with 2 revisions");
    const p = resolvePremiumIntentPreflightPolicy(c);
    expect(p.tier).toBe("A");
    expect(p.preferCompactStructuredServerDraft).toBe(true);
    expect(p.preferNeedsDetailsForWeakDraft).toBe(false);
  });

  it("founder vesting resolves to tier B (early needs_details profile)", () => {
    const c = resolveAgreementIntentContract("Two founders 60/40 vesting with one-year cliff");
    const p = resolvePremiumIntentPreflightPolicy(c);
    expect(p.tier).toBe("B");
    expect(p.askMissingFactsEarlier).toBe(true);
    expect(p.preferNeedsDetailsForWeakDraft).toBe(true);
  });

  it("tier B asks needs_details earlier when server reports missing material info", () => {
    const c = resolveAgreementIntentContract("Two founders 60/40 vesting");
    const p = resolvePremiumIntentPreflightPolicy(c);
    expect(
      shouldEarlyNeedsDetailsForTierB({
        policy: p,
        generationOutcome: "ok",
        missingMaterialInfo: ["vesting schedule details missing"],
      }),
    ).toBe(true);
  });

  it("tier A does not force early needs_details on missing list alone", () => {
    const c = resolveAgreementIntentContract("Need a logo contract for $1,500 with 2 revisions");
    const p = resolvePremiumIntentPreflightPolicy(c);
    expect(
      shouldEarlyNeedsDetailsForTierB({
        policy: p,
        generationOutcome: "ok",
        missingMaterialInfo: ["optional clarification"],
      }),
    ).toBe(false);
  });
});
