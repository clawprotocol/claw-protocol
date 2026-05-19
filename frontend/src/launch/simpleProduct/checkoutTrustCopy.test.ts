import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_CTA,
  CHECKOUT_CTA_ACTIVE_KEY,
  CHECKOUT_CTA_ALL_VARIANT_STRINGS,
  CHECKOUT_CTA_VARIANTS,
  CHECKOUT_DRAFT_SAVED_LINE,
  CHECKOUT_HUMAN_SUPPORT_LINE,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_SUPPORT_EMAIL,
  CHECKOUT_TRUST_STRIP_ITEMS,
  CHECKOUT_WHY_BUSINESSES_BULLETS,
  CHECKOUT_WORKFLOW_PAYMENT_NOTE,
  CHECKOUT_WORKFLOW_STEPS,
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

  it("exports workflow cue and draft-saved reassurance", () => {
    expect(CHECKOUT_WORKFLOW_STEPS).toEqual(["Draft", "Review", "Send", "Sign", "Proof"]);
    expect(CHECKOUT_WORKFLOW_PAYMENT_NOTE).toMatch(/does not send or sign/i);
    expect(CHECKOUT_DRAFT_SAVED_LINE).toMatch(/Draft saved/i);
  });

  it("keeps primary send/editable reassurance without duplicate why-business bullets", () => {
    expect(CHECKOUT_SECURE_MICROCOPY).toMatch(/editable until you approve and send/i);
    expect(CHECKOUT_TRUST_STRIP_ITEMS).toContain("Nothing sends without your approval");
    expect(CHECKOUT_WHY_BUSINESSES_BULLETS).toHaveLength(3);
    const whyJoined = CHECKOUT_WHY_BUSINESSES_BULLETS.join(" ").toLowerCase();
    expect(whyJoined).not.toMatch(/nothing sends|editable until approved|review before sending/);
    expect(CHECKOUT_AFTER_PAYMENT_STEPS).toEqual([
      "Review your upgraded agreement",
      "Edit or revise anything you want",
      "Send for review or signature only when you approve it",
    ]);
    expect(CHECKOUT_LEGAL_DISCLAIMER).not.toMatch(/Nothing is sent, signed, or shared/);
    expect(CHECKOUT_HUMAN_SUPPORT_LINE).toContain(CHECKOUT_SUPPORT_EMAIL);
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
