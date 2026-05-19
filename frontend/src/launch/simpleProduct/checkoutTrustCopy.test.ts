import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_AFTER_PAYMENT_LINE,
  CHECKOUT_CTA,
  CHECKOUT_CTA_ACTIVE_KEY,
  CHECKOUT_CTA_ALL_VARIANT_STRINGS,
  CHECKOUT_CTA_VARIANTS,
  CHECKOUT_CREATE_FLOW_FOOTER,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  logCheckoutTrustCopyRendered,
  resolveCheckoutCta,
} from "./checkoutTrustCopy";

describe("checkoutTrustCopy", () => {
  it("uses Continue with Pro as the default checkout CTA", () => {
    expect(CHECKOUT_CTA_ACTIVE_KEY).toBe("continue_pro");
    expect(CHECKOUT_CTA).toBe("Continue with Pro");
    expect(resolveCheckoutCta()).toBe(CHECKOUT_CTA_VARIANTS.continue_pro);
    expect(CHECKOUT_CTA_ALL_VARIANT_STRINGS.join(" ")).not.toContain("Unlock collaboration + send");
  });

  it("exports compact trust cluster copy only", () => {
    expect(CHECKOUT_SECURE_MICROCOPY).toMatch(/editable until you approve and send/i);
    expect(CHECKOUT_TRUST_STRIP_ITEMS).toEqual([
      "Cancel anytime",
      "30-day money-back guarantee",
      "Human support available",
      "Nothing sends without your approval",
    ]);
    expect(CHECKOUT_AFTER_PAYMENT_LINE).toMatch(/before sending or signing/i);
    expect(CHECKOUT_HUMAN_SUPPORT_LINE).toContain(CHECKOUT_SUPPORT_EMAIL);
    expect(CHECKOUT_SUPPORT_EMAIL).toBe("support@lawdog.me");
    expect(CHECKOUT_LEGAL_DISCLAIMER).toBe("LawDog is software, not a law firm. Not legal advice.");
    expect(CHECKOUT_CREATE_FLOW_FOOTER).toMatch(/Draft saved/i);
  });

  it("logs checkout-trust-copy-rendered with CTA key outside test mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const prev = import.meta.env.MODE;
    try {
      (import.meta.env as { MODE: string }).MODE = "development";
      logCheckoutTrustCopyRendered("create_flow_checkout");
      expect(info).toHaveBeenCalledWith("[checkout-trust-copy-rendered]", {
        surface: "create_flow_checkout",
        ctaKey: CHECKOUT_CTA_ACTIVE_KEY,
      });
    } finally {
      (import.meta.env as { MODE: string }).MODE = prev;
      info.mockRestore();
    }
  });
});
