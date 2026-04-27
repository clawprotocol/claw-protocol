import { describe, expect, it } from "vitest";
import { resolveStarterProRefineCheckoutSuccessEventName } from "./starterProRefineCheckoutSuccess";
import type { UpgradeCheckoutContextV1 } from "./upgradeCheckoutContextStorage";

describe("resolveStarterProRefineCheckoutSuccessEventName", () => {
  it("maps stashed upsell experiment arms", () => {
    expect(
      resolveStarterProRefineCheckoutSuccessEventName({
        starterProRefineCtaExperiment: "control",
        version: 1,
        savedAt: 1,
        reasons: [],
      } as UpgradeCheckoutContextV1),
    ).toBe("starter_pro_refine_control_checkout_success");
    expect(
      resolveStarterProRefineCheckoutSuccessEventName({
        starterProRefineCtaExperiment: "variant",
        version: 1,
        savedAt: 1,
        reasons: [],
      } as UpgradeCheckoutContextV1),
    ).toBe("starter_pro_refine_variant_checkout_success");
  });

  it("returns null when not from Starter Pro Refine path", () => {
    expect(
      resolveStarterProRefineCheckoutSuccessEventName({
        version: 1,
        savedAt: 1,
        reasons: ["x"],
      } as UpgradeCheckoutContextV1),
    ).toBeNull();
  });
});
