import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SimpleCheckoutPage dev payment bypass (static)", () => {
  const checkout = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
  const bypass = readFileSync(join(__dirname, "../devPaymentBypass.ts"), "utf8");
  const guestAuthority = readFileSync(join(__dirname, "../guestCheckoutAuthority.ts"), "utf8");

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

  it("gates staging QA bypass with genesis beta auth and visible checkout button", () => {
    expect(bypass).toContain("VITE_LAWDOG_QA_PAYMENT_BYPASS");
    expect(bypass).toContain("resolveQaPaymentBypassState");
    expect(bypass).toContain("isRecognizedQaPaymentBypassOrigin");
    expect(bypass).toContain("isPublicProductionHostname");
    expect(bypass).toContain("qa_server_");
    expect(checkout).toContain("refreshGenesisBetaPaymentBypassAuth");
    expect(checkout).toContain("resolveQaPaymentBypassState");
    expect(checkout).toContain("qaPaymentBypassActive");
    expect(checkout).toContain("QA bypass checkout");
    expect(checkout).toContain("[QA PAYMENT BYPASS]");
  });

  it("QA bypass settlement tags the paid session and funnel event as qa_bypass", () => {
    expect(checkout).toContain('await applyConfirmedSettlement(conf, "qa_bypass"');
    expect(checkout).toContain('source: paymentMode === "qa_bypass" ? "qa_bypass" : "settled_checkout"');
  });

  it("uses gated demo subscription sync instead of unconditional workspace demo-activate POST", () => {
    expect(checkout).toContain("syncDemoSubscriptionEntitlementIfApplicable");
    expect(checkout).not.toContain("demoActivateSubscription");
  });

  it("guest checkout uses demo settlement, not live Stripe", () => {
    // Guest checkout is detected by: no user + create-flow checkout
    expect(checkout).toContain("isGuestCheckout");
    expect(checkout).toContain("!user && agreementId === CREATE_FLOW_CHECKOUT_AGREEMENT_ID");

    // Guest checkout path uses demo settlement
    expect(checkout).toContain("[GUEST CHECKOUT] using demo settlement — never live Stripe for guest flywheel");
    expect(checkout).toContain("demoConfirmFiatToCryptoOnrampFromCard");

    // Guest checkout path runs BEFORE the Stripe check
    const onCardPay = checkout.match(/async function onCardPay[\s\S]*?(?=\n  const priceLine)/);
    expect(onCardPay).toBeTruthy();
    const body = onCardPay![0];
    const guestCheckIndex = body.indexOf("if (isGuestCheckout)");
    const stripeCheckIndex = body.indexOf("isStripeCheckoutApiConfigured()");
    expect(guestCheckIndex).toBeGreaterThan(0);
    expect(stripeCheckIndex).toBeGreaterThan(guestCheckIndex);
  });

  it("guest checkout creates demo session user with email from form", () => {
    // Email field exists for guest checkout
    expect(checkout).toContain("cardEmail");
    expect(checkout).toContain('id="cc-email"');
    expect(checkout).toContain("isGuestCheckout ?");

    // Demo session user receives email
    expect(checkout).toContain('email: cardEmail');
    expect(guestAuthority).toContain('email: string | null');
    expect(guestAuthority).toContain("createDemoSessionUser");
  });
});
