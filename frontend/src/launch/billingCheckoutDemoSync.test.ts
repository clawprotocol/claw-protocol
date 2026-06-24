import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shouldSyncDemoSubscriptionEntitlementAfterCheckout,
  syncDemoSubscriptionEntitlementIfApplicable,
} from "./billingCheckoutDemoSync";

vi.mock("./billingCheckoutApi", () => ({
  isStripeCheckoutApiConfigured: vi.fn(() => false),
  demoActivateSubscription: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../access/subscriptionEntitlementCache", () => ({
  refreshSubscriptionEntitlement: vi.fn(async () => null),
}));

vi.mock("./devPaymentBypass", () => ({
  isDevCreateFlowPaymentBypassEnabled: vi.fn(() => false),
}));

vi.mock("../config/featureFlags", () => ({
  featureFlags: { serverBilling: true },
}));

vi.mock("../lib/clawApi", () => ({
  isLocalBrowserOrigin: vi.fn(() => false),
}));

import { demoActivateSubscription } from "./billingCheckoutApi";
import { isDevCreateFlowPaymentBypassEnabled } from "./devPaymentBypass";
import { isLocalBrowserOrigin } from "../lib/clawApi";

describe("billingCheckoutDemoSync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not sync on QA bypass alone (staging entitlement is session-backed)", async () => {
    vi.mocked(isDevCreateFlowPaymentBypassEnabled).mockReturnValue(false);
    vi.mocked(isLocalBrowserOrigin).mockReturnValue(false);
    expect(shouldSyncDemoSubscriptionEntitlementAfterCheckout({ devBypass: false, localDemoCard: false })).toBe(
      false,
    );
    await syncDemoSubscriptionEntitlementIfApplicable({
      userId: "u1",
      orgId: "org1",
      qaBypass: true,
    });
    expect(demoActivateSubscription).not.toHaveBeenCalled();
  });

  it("syncs for dev bypass when Stripe checkout API is not configured", async () => {
    vi.mocked(isDevCreateFlowPaymentBypassEnabled).mockReturnValue(true);
    expect(shouldSyncDemoSubscriptionEntitlementAfterCheckout({ devBypass: true })).toBe(true);
    await syncDemoSubscriptionEntitlementIfApplicable({
      userId: "u1",
      orgId: "org1",
      devBypass: true,
    });
    expect(demoActivateSubscription).toHaveBeenCalledWith({ userId: "u1", orgId: "org1" });
  });

  it("syncs for local demo card settlement on loopback origin", async () => {
    vi.mocked(isLocalBrowserOrigin).mockReturnValue(true);
    expect(shouldSyncDemoSubscriptionEntitlementAfterCheckout({ localDemoCard: true })).toBe(true);
    await syncDemoSubscriptionEntitlementIfApplicable({
      userId: "u1",
      orgId: "org1",
      localDemoCard: true,
    });
    expect(demoActivateSubscription).toHaveBeenCalled();
  });
});
