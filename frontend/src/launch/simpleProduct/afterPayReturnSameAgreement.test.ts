import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("after-pay last-good handoff (static)", () => {
  const checkout = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
  const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
  const returnUx = readFileSync(join(__dirname, "../checkoutReturnEntitlement.ts"), "utf8");
  const params = readFileSync(join(__dirname, "../checkoutParams.ts"), "utf8");

  it("Stripe checkout uses last-good /app/create?premiumCompletion=1, not starterReview remint", () => {
    expect(checkout).toContain("buildAfterPayStripeReturnTo({ agreementId, returnTo })");
    expect(params).toContain('appendReturnToQueryParam(dest, "premiumCompletion", "1")');
    expect(params).toContain("dropStarterReviewRestoreParam");
    expect(params).not.toContain("restoreAgreementId");
    const startIdx = checkout.indexOf("async function startStripeCheckout");
    expect(startIdx).toBeGreaterThan(-1);
    const startBody = checkout.slice(startIdx, startIdx + 2200);
    expect(startBody).toContain("buildAfterPayStripeReturnTo");
  });

  it("create page treats premiumCompletion as after-pay, not unpaid starterReview Back", () => {
    expect(createPage).toContain('searchParams.get("premiumCompletion") === "1"');
    expect(createPage).toContain("!premiumCompletionReturn");
    expect(createPage).not.toContain("restoreAgreementId");
  });

  it("intake still runs last-good Pro generation on premiumCompletion, same persist via resume", () => {
    const effectIdx = intake.indexOf("After create-flow checkout: premium completion");
    expect(effectIdx).toBeGreaterThan(-1);
    const effect = intake.slice(effectIdx, intake.indexOf("const upgradeContextReasons", effectIdx));
    expect(effect).toContain('url.searchParams.get("premiumCompletion") === "1"');
    expect(effect).toContain("readCreateReviewAgreementResumeId");
    expect(effect).toContain("isAfterPayPremiumCompletionReturn");
    expect(effect).toContain("handleCheckoutReturnEntitlement");
    expect(effect).not.toContain("restoreAgreementId");
    expect(effect).not.toContain("Same persist through existing final review — do not remint");
  });

  it("verify return settles entitlement without a new URL scheme", () => {
    expect(returnUx).toContain("verifyBillingCheckoutSession");
    expect(returnUx).toContain("readCheckoutSessionIdFromUrl");
    expect(returnUx).toContain("markAdvancedFullDraftCheckoutGranted");
    expect(returnUx).toContain("shouldRefuseAfterPayPremiumCompletionForMissingGrant");
    expect(returnUx).not.toContain("restoreAgreementId");
    expect(returnUx).not.toContain("pinAfterPayRestoreAgreementIdFromWindow");
  });
});
