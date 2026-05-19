import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_ANNUAL_RENEWAL_COPY,
  CHECKOUT_CTA,
  CHECKOUT_CTA_CONTINUE_PRO,
  CHECKOUT_CTA_UNLOCK_PRO,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  logCheckoutTrustCopyRendered,
} from "./checkoutTrustCopy";

describe("checkoutTrustCopy", () => {
  it("uses non-sending Pro CTAs", () => {
    expect(CHECKOUT_CTA).toBe(CHECKOUT_CTA_UNLOCK_PRO);
    expect(CHECKOUT_CTA_UNLOCK_PRO).toBe("Unlock Pro Agreement");
    expect(CHECKOUT_CTA_CONTINUE_PRO).toBe("Continue with Pro");
    expect(CHECKOUT_CTA).not.toMatch(/send|sign|share/i);
  });

  it("exports trust strip, microcopy, and after-payment sequencing", () => {
    expect(CHECKOUT_SECURE_MICROCOPY).toMatch(/editable until you approve and send/i);
    expect(CHECKOUT_TRUST_STRIP_ITEMS).toEqual([
      "Cancel anytime",
      "30-day money-back guarantee",
      "Human support available",
      "Nothing sends without your approval",
    ]);
    expect(CHECKOUT_AFTER_PAYMENT_STEPS).toEqual([
      "Review your upgraded agreement",
      "Make any edits you want",
      "Send only when ready",
    ]);
    expect(CHECKOUT_ANNUAL_RENEWAL_COPY).toMatch(/renews automatically until canceled/i);
    expect(CHECKOUT_HUMAN_SUPPORT_LINE).toContain(CHECKOUT_SUPPORT_EMAIL);
    expect(CHECKOUT_SUPPORT_EMAIL).toBe("support@lawdog.me");
    expect(CHECKOUT_LEGAL_DISCLAIMER).toMatch(/not a law firm/i);
    expect(CHECKOUT_LEGAL_DISCLAIMER).toMatch(/Nothing is sent, signed, or shared until you confirm/i);
  });

  it("logs checkout-trust-copy-rendered outside test mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const prev = import.meta.env.MODE;
    try {
      (import.meta.env as { MODE: string }).MODE = "development";
      logCheckoutTrustCopyRendered("create_flow_checkout");
      expect(info).toHaveBeenCalledWith("[checkout-trust-copy-rendered]", {
        surface: "create_flow_checkout",
      });
    } finally {
      (import.meta.env as { MODE: string }).MODE = prev;
      info.mockRestore();
    }
  });
});
