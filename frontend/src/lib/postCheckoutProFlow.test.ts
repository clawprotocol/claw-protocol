import { describe, expect, it } from "vitest";
import { defaultPostCheckoutRunModelPassInput, getPremiumGenerationIntakeFingerprint } from "./postCheckoutProFlow";

describe("postCheckoutProFlow", () => {
  it("starts Pro from stable merged intake with gap resolver skipped (missing-facts non-blocking)", () => {
    const merged = "Party A in Delaware, services work. " + "x".repeat(400);
    expect(defaultPostCheckoutRunModelPassInput(merged)).toEqual({
      intakeText: merged,
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
    });
  });

  it("fingerprint is stable for the same string", () => {
    const a = getPremiumGenerationIntakeFingerprint("a\nb");
    const b = getPremiumGenerationIntakeFingerprint("a\nb");
    expect(a).toBe(b);
  });
});
