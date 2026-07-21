/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { logStarterUpgradeTransition } from "./starterUpgradeTransition";

describe("logStarterUpgradeTransition", () => {
  it("emits structured checkout boundary payload", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logStarterUpgradeTransition({
      source: "starter_review_bottom_cta",
      component: "unified_bottom_cta",
      nextStep: "checkout",
      paymentRequired: true,
      entitlementPresent: false,
      anonymous: true,
      orgId: "anon-test",
    });
    expect(spy).toHaveBeenCalledWith("[starter-upgrade-transition]", {
      source: "starter_review_bottom_cta",
      component: "unified_bottom_cta",
      nextStep: "checkout",
      paymentRequired: true,
      entitlementPresent: false,
      anonymous: true,
      orgId: "anon-test",
    });
    spy.mockRestore();
  });
});
