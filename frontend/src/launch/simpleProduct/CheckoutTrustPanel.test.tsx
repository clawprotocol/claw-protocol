/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckoutTrustPanel } from "./CheckoutTrustPanel";
import {
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_ANNUAL_RENEWAL_COPY,
  CHECKOUT_SECURE_MICROCOPY,
  CHECKOUT_TRUST_STRIP_ITEMS,
} from "./checkoutTrustCopy";

afterEach(() => cleanup());

describe("CheckoutTrustPanel", () => {
  it("renders trust strip, microcopy, and after-payment steps", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" showAnnualRenewal />);
    expect(screen.getByTestId("checkout-trust-panel")).toBeTruthy();
    expect(screen.getByText(CHECKOUT_SECURE_MICROCOPY)).toBeTruthy();
    for (const item of CHECKOUT_TRUST_STRIP_ITEMS) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    for (const step of CHECKOUT_AFTER_PAYMENT_STEPS) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    expect(screen.queryByText(CHECKOUT_ANNUAL_RENEWAL_COPY)).toBeNull();
  });

  it("shows annual renewal copy only for annual cadence", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="annual" showAnnualRenewal />);
    expect(screen.getByText(CHECKOUT_ANNUAL_RENEWAL_COPY)).toBeTruthy();
  });

  it("uses responsive min-w-0 layout hooks for narrow viewports", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" />);
    const panel = screen.getByTestId("checkout-trust-panel");
    expect(panel.className).toMatch(/min-w-0/);
    const strip = screen.getByTestId("checkout-trust-strip");
    expect(strip.className).toMatch(/grid-cols-1/);
    expect(strip.className).toMatch(/min-\[480px\]:grid-cols-2/);
  });
});
