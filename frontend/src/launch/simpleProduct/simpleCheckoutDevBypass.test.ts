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

  it("marks checkout funnel success as settled/session-backed", () => {
    expect(checkout).toContain('"checkout_success_returned"');
    expect(checkout).toContain('settlement_status: "confirmed"');
    expect(checkout).toContain('payment_authority: "settled_session"');
    expect(checkout.indexOf('"checkout_success_returned"')).toBeGreaterThan(
      checkout.indexOf("finishedRef.current = true"),
    );
  });

  it("shows visible message when local smoke bypass is disabled", () => {
    expect(checkout).toContain("[dev-payment-bypass-disabled-blocking-local-smoke]");
    expect(checkout).toContain("Dev payment bypass is disabled");
  });

  it("gates staging QA bypass with a dedicated flag and visible checkout button", () => {
    expect(bypass).toContain("VITE_LAWDOG_QA_PAYMENT_BYPASS");
    expect(bypass).toContain("resolveQaPaymentBypassState");
    expect(bypass).toContain("isRecognizedQaPaymentBypassOrigin");
    expect(checkout).toContain("resolveQaPaymentBypassState");
    expect(checkout).toContain("qaPaymentBypassActive");
    expect(checkout).toContain("QA bypass checkout");
    expect(checkout).toContain("[QA PAYMENT BYPASS]");
  });

  it("QA bypass settlement tags the paid session and funnel event as qa_bypass", () => {
    expect(checkout).toContain('await applyConfirmedSettlement(conf, "qa_bypass")');
    expect(checkout).toContain('payment_mode: paymentMode');
    expect(checkout).toContain('source: paymentMode === "qa_bypass" ? "qa_bypass" : "settled_checkout"');
  });
});
