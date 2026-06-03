import { describe, expect, it } from "vitest";
import {
  PREMIUM_AGREEMENT_PARSE_CHECKOUT_MS,
  PREMIUM_AGREEMENT_PARSE_DEFAULT_MS,
  PREMIUM_BASIC_PARSE_TIMEOUT_MS,
  resolvePremiumAgreementParseTimeoutMs,
} from "./premiumAgreementParseTimeout";

describe("resolvePremiumAgreementParseTimeoutMs", () => {
  it("uses 90s default for premium non-checkout", () => {
    expect(resolvePremiumAgreementParseTimeoutMs({ aiModelClass: "premium" })).toBe(
      PREMIUM_AGREEMENT_PARSE_DEFAULT_MS,
    );
    expect(PREMIUM_AGREEMENT_PARSE_DEFAULT_MS).toBe(90_000);
  });

  it("uses extended checkout budget above 90s for long full-draft generations", () => {
    const ms = resolvePremiumAgreementParseTimeoutMs({
      aiModelClass: "premium",
      checkoutCompletion: true,
    });
    expect(ms).toBe(PREMIUM_AGREEMENT_PARSE_CHECKOUT_MS);
    expect(ms).toBeGreaterThan(90_000);
    expect(ms).toBeGreaterThanOrEqual(150_000);
  });

  it("keeps basic parse at 5s", () => {
    expect(resolvePremiumAgreementParseTimeoutMs({ aiModelClass: "basic" })).toBe(
      PREMIUM_BASIC_PARSE_TIMEOUT_MS,
    );
  });
});
