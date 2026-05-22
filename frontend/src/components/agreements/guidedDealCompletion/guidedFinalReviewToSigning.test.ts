import { describe, expect, it } from "vitest";
import { resolveGuidedSigningAuthoritativePlain } from "./guidedFinalReviewToSigning";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedReviewSigningContinuity";

const LONG = "A".repeat(14_483);
const SHORT_RENDERED = "B".repeat(8_954);

describe("resolveGuidedSigningAuthoritativePlain", () => {
  it("prefers frozen authoritative corpus over shortened rendered preview", () => {
    const plain = resolveGuidedSigningAuthoritativePlain({
      snapshot: LONG,
      renderedPreview: SHORT_RENDERED,
    });
    expect(plain.length).toBe(LONG.length);
    expect(plain).not.toBe(SHORT_RENDERED);
  });

  it("accepts guided authoritative when above signing threshold", () => {
    const guided = "C".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 100);
    const plain = resolveGuidedSigningAuthoritativePlain({
      guidedAuthoritative: guided,
      renderedPreview: SHORT_RENDERED,
    });
    expect(plain.length).toBeGreaterThanOrEqual(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN);
  });
});
