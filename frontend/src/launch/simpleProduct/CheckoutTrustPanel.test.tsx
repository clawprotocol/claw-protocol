/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckoutTrustPanel } from "./CheckoutTrustPanel";
import {
  CHECKOUT_AFTER_PAYMENT_LINE,
  CHECKOUT_CTA,
  CHECKOUT_LEGAL_DISCLAIMER,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_TRUST_STRIP_ITEMS,
} from "./checkoutTrustCopy";

afterEach(() => cleanup());

const REMOVED_PANEL_MARKERS = [
  "Why businesses use LawDog",
  "Used for business agreements",
  "Draft → Review",
  "Tracked signatures and verification records",
] as const;

describe("CheckoutTrustPanel", () => {
  it("renders only the compact trust cluster", () => {
    render(<CheckoutTrustPanel surface="checkout" />);
    expect(screen.getByTestId("checkout-trust-panel")).toBeTruthy();
    expect(screen.getByText(CHECKOUT_SECURE_MICROCOPY)).toBeTruthy();
    expect(screen.getByTestId("checkout-trust-strip")).toBeTruthy();
    for (const item of CHECKOUT_TRUST_STRIP_ITEMS) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    expect(screen.getByTestId("checkout-after-payment")).toBeTruthy();
    expect(screen.getByText(CHECKOUT_AFTER_PAYMENT_LINE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "support@lawdog.me" })).toBeTruthy();
    expect(screen.queryByText(CHECKOUT_LEGAL_DISCLAIMER)).toBeNull();
    for (const removed of REMOVED_PANEL_MARKERS) {
      expect(screen.queryByText(new RegExp(removed, "i"))).toBeNull();
    }
    const afterPayment = screen.getByTestId("checkout-after-payment");
    expect(afterPayment.tagName).toBe("P");
    expect(afterPayment.className).not.toMatch(/rounded-lg|list-decimal/);
  });

  it("keeps default CTA and responsive trust strip layout hooks", () => {
    expect(CHECKOUT_CTA).toBe("Continue with Pro");
    render(<CheckoutTrustPanel surface="checkout" />);
    const panel = screen.getByTestId("checkout-trust-panel");
    expect(panel.className).toMatch(/min-w-0/);
    expect(panel.className).toMatch(/space-y-2\.5/);
    const strip = screen.getByTestId("checkout-trust-strip");
    expect(strip.className).toMatch(/grid-cols-1/);
    expect(strip.className).toMatch(/min-\[480px\]:grid-cols-2/);
    expect(strip.className).toMatch(/gap-1\.5/);
  });
});
