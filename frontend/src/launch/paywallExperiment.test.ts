import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getSendConversionPaywallVariantId, resolveSendPaywallCopy, paywallDimensionsForVariant } from "./paywallExperiment";

describe("paywallExperiment", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => "test-session-paywall-exp",
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: () => null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveSendPaywallCopy control has expected dimension keys", () => {
    const c = resolveSendPaywallCopy("control");
    expect(c.ctaLabel).toBe("Continue with Pro");
    expect(c.showSecondaryUrgency).toBe(true);
    expect(paywallDimensionsForVariant("control").headline_frame).toBe("default");
  });

  it("resolveSendPaywallCopy v1 differs on urgency density", () => {
    const c = resolveSendPaywallCopy("v1");
    expect(c.opener).toBe("How do you want to send it?");
    expect(c.showSecondaryUrgency).toBe(false);
  });

  it("historical continue_plus / plusBlurb keys never surface buyer-facing Plus copy", () => {
    for (const variant of ["control", "v1"] as const) {
      const c = resolveSendPaywallCopy(variant);
      const dims = paywallDimensionsForVariant(variant);
      expect(c.plusBlurb).toBe("");
      expect(c.ctaLabel).not.toMatch(/\bPlus\b/i);
      expect(c.valueCompressionLine).not.toMatch(/\bPlus\b/i);
      expect(c.premiumPitchAboveCta).not.toMatch(/\bPlus\b/i);
      expect(JSON.stringify(c)).not.toMatch(/\bPlus\b/);
      // Experiment dimension id may remain historical; resolved buyer copy must not.
      if (dims.cta_copy === "continue_plus") {
        expect(c.ctaLabel).toMatch(/Pro/i);
      }
    }
  });

  it("getSendConversionPaywallVariantId returns deterministic variant for session", () => {
    const a = getSendConversionPaywallVariantId();
    const b = getSendConversionPaywallVariantId();
    expect(a).toBe(b);
    expect(["control", "v1"]).toContain(a);
  });
});
