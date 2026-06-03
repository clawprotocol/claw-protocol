import { describe, expect, it } from "vitest";
import {
  clearPremiumParseSessionGuard,
  isPremiumParseTimeoutDeferredCheckoutRetry,
  isPremiumParseTimeoutError,
  markPremiumAuthoritativeServerCorpusAccepted,
  shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept,
} from "./premiumParseSessionGuard";

describe("premiumParseSessionGuard", () => {
  it("classifies premium_parse_timeout abort reasons", () => {
    expect(isPremiumParseTimeoutError(new Error("premium_parse_timeout"))).toBe(true);
    expect(isPremiumParseTimeoutDeferredCheckoutRetry(new Error("premium_parse_timeout"))).toBe(
      true,
    );
    expect(isPremiumParseTimeoutError(new Error("premium_completion_attempt_timeout_600000ms"))).toBe(
      false,
    );
  });

  it("suppresses retry after authoritative accept for parse timeout", () => {
    clearPremiumParseSessionGuard();
    markPremiumAuthoritativeServerCorpusAccepted();
    expect(shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept(new Error("premium_parse_timeout"))).toBe(
      true,
    );
    clearPremiumParseSessionGuard();
  });
});
