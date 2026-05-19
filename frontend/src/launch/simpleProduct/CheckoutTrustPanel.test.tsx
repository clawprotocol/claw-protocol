/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CheckoutTrustPanel } from "./CheckoutTrustPanel";
import {
  CHECKOUT_AFTER_PAYMENT_STEPS,
  CHECKOUT_CTA,
  CHECKOUT_DRAFT_SAVED_LINE,
  CHECKOUT_TRUST_STRIP_ITEMS,
  CHECKOUT_WORKFLOW_STEPS,
} from "./checkoutTrustCopy";

afterEach(() => cleanup());

describe("CheckoutTrustPanel", () => {
  it("renders lighter inline after-payment sequence and workflow cue", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" />);
    const afterPayment = screen.getByTestId("checkout-after-payment");
    expect(afterPayment.className).not.toMatch(/rounded-lg.*bg-slate-950\/50/);
    for (const step of CHECKOUT_AFTER_PAYMENT_STEPS) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    const workflow = screen.getByTestId("checkout-workflow-cue");
    expect(workflow.className).toMatch(/min-w-0/);
    for (const step of CHECKOUT_WORKFLOW_STEPS) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    expect(screen.getByText(/does not send or sign/i)).toBeTruthy();
  });

  it("keeps trust strip items and default CTA copy source", () => {
    expect(CHECKOUT_CTA).toBe("Continue with Pro");
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" />);
    for (const item of CHECKOUT_TRUST_STRIP_ITEMS) {
      expect(screen.getByText(item)).toBeTruthy();
    }
    const strip = screen.getByTestId("checkout-trust-strip");
    expect(strip.className).toMatch(/grid-cols-1/);
    expect(strip.className).toMatch(/min-\[480px\]:grid-cols-2/);
    expect(strip.className).toMatch(/gap-1\.5/);
  });

  it("shows draft saved and omits duplicate operational send block", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" />);
    expect(screen.getByTestId("checkout-draft-saved")).toBeTruthy();
    expect(screen.getByText(CHECKOUT_DRAFT_SAVED_LINE)).toBeTruthy();
    expect(screen.queryByTestId("checkout-operational-legitimacy")).toBeNull();
    expect(screen.queryByText(/No agreement is sent, signed, or shared until you confirm/i)).toBeNull();
  });

  it("uses compact panel spacing and overflow-safe layout hooks", () => {
    render(<CheckoutTrustPanel surface="checkout" cadence="monthly" />);
    const panel = screen.getByTestId("checkout-trust-panel");
    expect(panel.className).toMatch(/min-w-0/);
    expect(panel.className).toMatch(/space-y-3/);
    expect(panel.className).not.toMatch(/space-y-4/);
  });
});
