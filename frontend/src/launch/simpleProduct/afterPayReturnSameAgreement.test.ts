import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("after-pay return same persist (static)", () => {
  const checkout = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
  const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
  const returnUx = readFileSync(join(__dirname, "../checkoutReturnEntitlement.ts"), "utf8");

  it("Stripe checkout sends restoreAgreementId, not starterReview remint, for a real persist", () => {
    expect(checkout).toContain("buildAfterPayStripeReturnTo({ agreementId, returnTo })");
    expect(checkout).toContain("createBillingCheckoutSession({");
    const startIdx = checkout.indexOf("async function startStripeCheckout");
    expect(startIdx).toBeGreaterThan(-1);
    const startBody = checkout.slice(startIdx, startIdx + 2200);
    expect(startBody).toContain("buildAfterPayStripeReturnTo");
    expect(startBody).not.toMatch(/returnTo:\s*returnTarget[\s\S]*CREATE_FLOW_CHECKOUT_AGREEMENT_ID/);
  });

  it("create page pins restoreAgreementId and does not treat after-pay as starterReview remint", () => {
    expect(createPage).toContain("readAfterPayRestoreAgreementIdFromSearch");
    expect(createPage).toContain("pinAfterPayRestoreAgreementId");
    expect(createPage).toContain("!afterPayRestoreAgreementId");
  });

  it("intake skips Retry Pro draft remint when restoreAgreementId is the paid persist", () => {
    const effectIdx = intake.indexOf("After create-flow checkout: premium completion");
    expect(effectIdx).toBeGreaterThan(-1);
    const effect = intake.slice(effectIdx, effectIdx + 1800);
    expect(effect).toContain("readAfterPayRestoreAgreementIdFromSearch");
    expect(effect).toContain("pinAfterPayRestoreAgreementId");
    expect(effect).toContain("paidCheckoutCompletedRef.current = true");
    expect(effect).toContain("Same persist through existing final review");
  });

  it("verify return pins restoreAgreementId before settlement", () => {
    expect(returnUx).toContain("pinAfterPayRestoreAgreementIdFromWindow");
    const handleIdx = returnUx.indexOf("export async function handleCheckoutReturnEntitlement");
    expect(handleIdx).toBeGreaterThan(-1);
    expect(returnUx.indexOf("pinAfterPayRestoreAgreementIdFromWindow()", handleIdx)).toBeGreaterThan(handleIdx);
    expect(returnUx.indexOf("readCheckoutSessionIdFromUrl()", handleIdx)).toBeGreaterThan(
      returnUx.indexOf("pinAfterPayRestoreAgreementIdFromWindow()", handleIdx),
    );
  });
});
