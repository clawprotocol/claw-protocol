import { describe, expect, it } from "vitest";
import {
  billingStatusDetail,
  billingStatusHeadline,
  formatAuthoritativeBillingDate,
  formatAuthoritativeCadence,
  shouldOfferProCheckout,
} from "./billingAccountDisplay";
import type { BillingStatusPayload } from "./billingStatusApi";

function status(partial: Partial<BillingStatusPayload>): BillingStatusPayload {
  return {
    org_id: "user-owner",
    display_state: "active",
    entitled: true,
    plan_code: "pro",
    plan_label: "LawDog Pro",
    status: "active",
    billing_interval: "month",
    current_period_end: "2099-12-31T00:00:00Z",
    canceled_at: null,
    cancel_at_period_end: false,
    has_stripe_customer: true,
    stripe_configured: true,
    manage_available: true,
    ...partial,
  };
}

describe("billing account display", () => {
  it("formats dates and cadence only from authoritative fields", () => {
    expect(formatAuthoritativeBillingDate("2099-12-31T00:00:00Z")).toMatch(/December 31, 2099/);
    expect(formatAuthoritativeBillingDate("not-a-date")).toBeNull();
    expect(formatAuthoritativeBillingDate(null)).toBeNull();
    expect(formatAuthoritativeCadence("month")).toBe("Monthly");
    expect(formatAuthoritativeCadence("year")).toBe("Annual");
    expect(formatAuthoritativeCadence(null)).toBeNull();
  });

  it("distinguishes the customer-facing states", () => {
    expect(billingStatusHeadline("loading", null)).toMatch(/Loading/);
    expect(billingStatusHeadline("no_subscription", null)).toMatch(/No subscription/);
    expect(billingStatusHeadline("active", "LawDog Pro")).toContain("LawDog Pro");
    expect(billingStatusHeadline("scheduled_cancellation", "LawDog Pro")).toMatch(/scheduled to cancel/);
    expect(billingStatusHeadline("expired_canceled", null)).toMatch(/no longer active/);
    expect(billingStatusHeadline("payment_problem", null)).toMatch(/problem with the payment/);
    expect(billingStatusHeadline("unavailable", null)).toMatch(/unavailable/);
  });

  it("does not invent a period end or cadence", () => {
    const detail = billingStatusDetail(
      status({ billing_interval: null, current_period_end: null }),
      "active",
    );
    expect(detail).toBe("");
  });

  it("keeps access language for scheduled cancellation", () => {
    expect(billingStatusDetail(status({ cancel_at_period_end: true }), "scheduled_cancellation")).toMatch(
      /Access continues through/,
    );
  });

  it("offers checkout only when the server says the workspace is not entitled", () => {
    expect(shouldOfferProCheckout(status({ entitled: true }), "active")).toBe(false);
    expect(shouldOfferProCheckout(status({ entitled: true }), "scheduled_cancellation")).toBe(false);
    expect(shouldOfferProCheckout(status({ entitled: false, display_state: "no_subscription" }), "no_subscription")).toBe(
      true,
    );
    expect(shouldOfferProCheckout(null, "loading")).toBe(false);
    expect(shouldOfferProCheckout(null, "unavailable")).toBe(false);
  });
});
