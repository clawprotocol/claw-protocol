import { describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  buildAfterPayStripeReturnTo,
  extractAgreementIdFromSendReturnUrl,
  safeReturnToForAgreement,
  parseTierIdParam,
  resolveCheckoutTier,
} from "./checkoutParams";

describe("checkoutParams", () => {
  it("extracts agreement id from send return URL", () => {
    expect(extractAgreementIdFromSendReturnUrl("/app/send/a-1?phase=send")).toBe("a-1");
    expect(extractAgreementIdFromSendReturnUrl("/app/ready/x")).toBeNull();
  });

  it("safeReturnToForAgreement rejects mismatched agreement ids", () => {
    expect(safeReturnToForAgreement("right", "/app/send/wrong?phase=send")).toBe("/app/send/right?phase=send");
    expect(safeReturnToForAgreement("right", "/app/send/right?phase=send")).toBe("/app/send/right?phase=send");
  });

  it("resolveCheckoutTier maps enterprise param to Pro self-serve checkout", () => {
    const t = resolveCheckoutTier(parseTierIdParam("enterprise"));
    expect(t.id).toBe("pro");
  });

  it("resolveCheckoutTier maps legacy starter/plus deep links to Pro", () => {
    expect(resolveCheckoutTier(parseTierIdParam("starter")).id).toBe("pro");
    expect(resolveCheckoutTier(parseTierIdParam("plus")).id).toBe("pro");
  });
});

describe("after-pay last-good create return", () => {
  const persistId = "3405d65b-f4fc-4b33-81d8-84a0734b927b";

  it("drops starterReview and restores premiumCompletion on create return", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: persistId,
      returnTo: "/app/create?restore=starterReview",
    });
    expect(dest).toBe("/app/create?premiumCompletion=1");
  });

  it("same last-good return for the create-flow sentinel", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      returnTo: "/app/create?restore=starterReview",
    });
    expect(dest).toBe("/app/create?premiumCompletion=1");
  });

  it("does not rewrite send-path returnTo", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: persistId,
      returnTo: `/app/send/${persistId}?phase=send`,
    });
    expect(dest).toBe(`/app/send/${persistId}?phase=send`);
  });
});
