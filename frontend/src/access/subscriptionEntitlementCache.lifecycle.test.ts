/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedSubscriptionEntitlement,
  readCachedSubscriptionEntitlement,
  subscribeToSubscriptionEntitlementChanges,
  writeCachedSubscriptionEntitlement,
} from "./subscriptionEntitlementCache";

describe("subscription entitlement lifecycle", () => {
  afterEach(() => {
    clearCachedSubscriptionEntitlement();
    localStorage.clear();
  });

  it("notifies the mounted application after checkout writes a paid plan", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSubscriptionEntitlementChanges(listener);
    writeCachedSubscriptionEntitlement(
      { org_id: "user-paid", plan_code: "pro", status: "active" },
      "user-paid",
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readCachedSubscriptionEntitlement()?.tier).toBe("premium");
    unsubscribe();
  });

  it("notifies the application and removes paid access on session clear", () => {
    writeCachedSubscriptionEntitlement(
      { org_id: "user-paid", plan_code: "pro", status: "active" },
      "user-paid",
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToSubscriptionEntitlementChanges(listener);

    clearCachedSubscriptionEntitlement();

    expect(readCachedSubscriptionEntitlement()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
