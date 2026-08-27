/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { clearPreAuthCheckoutAgreementId, readPreAuthCheckoutAgreementId } from "../auth/preAuthCheckoutAgreement";
import {
  AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM,
  buildAfterPayStripeReturnTo,
  extractAgreementIdFromSendReturnUrl,
  pinAfterPayRestoreAgreementId,
  readAfterPayRestoreAgreementIdFromSearch,
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

describe("after-pay return restoreAgreementId", () => {
  const persistId = "3405d65b-f4fc-4b33-81d8-84a0734b927b";

  beforeEach(() => {
    sessionStorage.clear();
    clearPreAuthCheckoutAgreementId();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearPreAuthCheckoutAgreementId();
  });

  it("rewrites create returnTo off starterReview onto the paid persist", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: persistId,
      returnTo: "/app/create?restore=starterReview",
    });
    expect(dest).toContain(`${AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM}=${persistId}`);
    expect(dest).toContain("premiumCompletion=1");
    expect(dest).not.toContain("restore=starterReview");
  });

  it("leaves sentinel create-flow on starterReview", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      returnTo: "/app/create?restore=starterReview",
    });
    expect(dest).toContain("restore=starterReview");
    expect(dest).toContain("premiumCompletion=1");
    expect(dest).not.toContain(AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM);
  });

  it("does not rewrite send-path returnTo", () => {
    const dest = buildAfterPayStripeReturnTo({
      agreementId: persistId,
      returnTo: `/app/send/${persistId}?phase=send`,
    });
    expect(dest).toBe(`/app/send/${persistId}?phase=send`);
  });

  it("reads restoreAgreementId and pins resume/pre-auth so after-pay does not remint", () => {
    expect(
      readAfterPayRestoreAgreementIdFromSearch(
        `?restore=starterReview&restoreAgreementId=${persistId}&premiumCompletion=1`,
      ),
    ).toBe(persistId);
    expect(pinAfterPayRestoreAgreementId(persistId)).toBe(persistId);
    expect(readCreateReviewAgreementResumeId()).toBe(persistId);
    expect(readPreAuthCheckoutAgreementId()).toBe(persistId);
  });
});
