import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SimpleCheckoutPage dev payment bypass (static)", () => {
  const checkout = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
  const bypass = readFileSync(join(__dirname, "../devPaymentBypass.ts"), "utf8");

  it("resolves bypass from local origin, not only import.meta.env.DEV", () => {
    expect(bypass).toContain("isLocalBrowserOrigin");
    expect(bypass).not.toMatch(/if \(e\.PROD\) return false/);
    expect(checkout).toContain("logDevPaymentBypassState");
    expect(checkout).toContain("resolveDevPaymentBypassState");
  });

  it("checkout CTA bypass path runs before genesis gate in onCardPay", () => {
    const onCardPay = checkout.match(/async function onCardPay[\s\S]*?(?=\n  const priceLine)/);
    expect(onCardPay).toBeTruthy();
    const body = onCardPay![0];
    expect(body).toContain("[DEV PAYMENT BYPASS] simulating successful payment");
    expect(body).toMatch(/if \(devPaymentBypassActive\)[\s\S]*applyConfirmedSettlement/);
    expect(body).toContain("ensureGenesisReferralHandoffForCheckout().catch");
    expect(body.indexOf("if (devPaymentBypassActive)")).toBeLessThan(body.indexOf("if (!genesisHandoff.ok)"));
  });

  it("logs checkout_complete and premium return handoff on settlement", () => {
    expect(checkout).toContain('logPaymentFlowStage("checkout_complete"');
    expect(checkout).toContain("[premium-flow] payment_return_detected");
    expect(checkout).toContain("markPaidPremiumCompletionSession");
  });

  it("shows visible message when local smoke bypass is disabled", () => {
    expect(checkout).toContain("[dev-payment-bypass-disabled-blocking-local-smoke]");
    expect(checkout).toContain("Dev payment bypass is disabled");
  });
});
