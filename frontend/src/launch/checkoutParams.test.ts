import { describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  buildAfterPayStripeReturnTo,
  buildConversionCheckoutReturnTo,
  buildCreateFlowCheckoutHref,
  extractAgreementIdFromSendReturnUrl,
  safeReturnToForAgreement,
  parseTierIdParam,
  resolveCheckoutTier,
  CREATE_FLOW_CHECKOUT_DEFAULT_CADENCE,
  buildCreateFlowProCheckoutPath,
  isCreateFlowUpgradeReturnTo,
  sanitizeConversionCheckoutDest,
  sanitizeConversionCheckoutReturnTo,
} from "./checkoutParams";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import { buildCreateReturnToWithStarterReviewRestore } from "../components/agreements/checkoutBackRestore";
import { checkoutInvoiceUsd } from "./pricingKeyMath";
import { LAUNCH_PRICING_TIERS } from "./pricingTiersData";

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

  it("create-flow starter upgrade checkout defaults to monthly cadence and $49 invoice", () => {
    const pro = LAUNCH_PRICING_TIERS.find((t) => t.id === "pro")!;
    const returnTo = buildCreateReturnToWithStarterReviewRestore();
    const path = buildCreateFlowProCheckoutPath({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      returnTo,
    });
    expect(CREATE_FLOW_CHECKOUT_DEFAULT_CADENCE).toBe("monthly");
    expect(path).toBe(
      "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate%3Frestore%3DstarterReview",
    );
    expect(path).not.toContain("cadence=annual");
    expect(checkoutInvoiceUsd(pro, CREATE_FLOW_CHECKOUT_DEFAULT_CADENCE)).toBe(49);
    expect(checkoutInvoiceUsd(pro, "annual")).toBe(490);
  });

  it("create-flow upgrade returnTo is /app/create, not a send URL", () => {
    expect(isCreateFlowUpgradeReturnTo("/app/create")).toBe(true);
    expect(isCreateFlowUpgradeReturnTo("/app/create?restore=starterReview")).toBe(true);
    expect(isCreateFlowUpgradeReturnTo("/app/send/a-1?phase=send")).toBe(false);
    expect(isCreateFlowUpgradeReturnTo(null)).toBe(false);
  });

  it("create-flow checkout path preserves explicit annual opt-in", () => {
    const path = buildCreateFlowProCheckoutPath({
      agreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      returnTo: "/app/create?restore=starterReview",
      cadence: "annual",
    });
    expect(path).toContain("cadence=annual");
  });
});

describe("conversion checkout returnTo restore flags", () => {
  const persistId = "e5a71257-87bb-47cc-aa03-63adf6b61089";

  it("does not inject restore=starterReview when a persist/resume ID exists", () => {
    expect(buildConversionCheckoutReturnTo(persistId)).toBe("/app/create");
    expect(buildConversionCheckoutReturnTo(persistId)).not.toContain("restore=starterReview");
  });

  it("keeps unpaid starterReview restore when there is no persist ID", () => {
    expect(buildConversionCheckoutReturnTo(null)).toBe("/app/create?restore=starterReview");
    expect(buildConversionCheckoutReturnTo("")).toBe("/app/create?restore=starterReview");
    expect(buildConversionCheckoutReturnTo(CREATE_FLOW_CHECKOUT_AGREEMENT_ID)).toBe(
      "/app/create?restore=starterReview",
    );
  });

  it("strips starterReview decoy from create returnTo when persist exists", () => {
    expect(
      sanitizeConversionCheckoutReturnTo({
        returnTo: "/app/create?restore=starterReview",
        persistAgreementId: persistId,
      }),
    ).toBe("/app/create");
    expect(
      sanitizeConversionCheckoutReturnTo({
        returnTo: "/app/create?restore=starterReview",
        persistAgreementId: null,
      }),
    ).toBe("/app/create?restore=starterReview");
  });

  it("strips restore=starterReview from checkout/OAuth dest when persist is in the path", () => {
    const dest = `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    const cleaned = sanitizeConversionCheckoutDest({ dest });
    expect(cleaned).not.toContain("restore");
    expect(cleaned).not.toContain("starterReview");
    expect(cleaned).toContain(`returnTo=${encodeURIComponent("/app/create")}`);
    expect(cleaned).toContain(persistId);
  });

  it("leaves sentinel checkout dest restore intact when no persist ID is supplied", () => {
    const dest = `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    expect(sanitizeConversionCheckoutDest({ dest })).toBe(dest);
  });

  it("pins placeholder dest to persist and drops restore when persist is supplied", () => {
    const dest = `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
      "/app/create?restore=starterReview",
    )}`;
    const cleaned = sanitizeConversionCheckoutDest({ dest, persistAgreementId: persistId });
    expect(cleaned).toBe(
      `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(cleaned).not.toContain("starterReview");
    expect(cleaned).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
  });

  it("Continue-with-Pro first hop threads persist AID and omits restore decoy", () => {
    const href = buildCreateFlowCheckoutHref({ cadence: "monthly", persistAgreementId: persistId });
    expect(href).toBe(
      `/app/checkout/${persistId}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(href).not.toContain("starterReview");
    expect(href).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
  });

  it("Continue-with-Pro first hop keeps restore when there is no persist ID", () => {
    expect(buildCreateFlowCheckoutHref({ cadence: "monthly" })).toBe(
      `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
        "/app/create?restore=starterReview",
      )}`,
    );
    expect(
      buildCreateFlowCheckoutHref({
        cadence: "monthly",
        persistAgreementId: CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
      }),
    ).toBe(
      `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
        "/app/create?restore=starterReview",
      )}`,
    );
  });

  it("does not rewrite send-path returnTo on checkout dest", () => {
    const dest = `/app/checkout/${persistId}?tier=pro&returnTo=${encodeURIComponent(
      `/app/send/${persistId}?phase=send`,
    )}`;
    expect(sanitizeConversionCheckoutDest({ dest, persistAgreementId: persistId })).toBe(dest);
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
