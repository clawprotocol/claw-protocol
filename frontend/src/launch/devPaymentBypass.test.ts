import { describe, expect, it } from "vitest";
import { isDevCreateFlowPaymentBypassEnabled } from "./devPaymentBypass";

describe("isDevCreateFlowPaymentBypassEnabled", () => {
  it("is false in production-shaped env", () => {
    expect(
      isDevCreateFlowPaymentBypassEnabled({
        PROD: true,
        DEV: false,
        VITE_ENABLE_DEV_PAYMENT_BYPASS: "1",
      }),
    ).toBe(false);
  });

  it("is true in dev-shaped env when env is unset (default on)", () => {
    expect(
      isDevCreateFlowPaymentBypassEnabled({
        PROD: false,
        DEV: true,
      }),
    ).toBe(true);
  });

  it("is false when explicitly opted out", () => {
    expect(
      isDevCreateFlowPaymentBypassEnabled({
        PROD: false,
        DEV: true,
        VITE_ENABLE_DEV_PAYMENT_BYPASS: "0",
      }),
    ).toBe(false);
  });
});
