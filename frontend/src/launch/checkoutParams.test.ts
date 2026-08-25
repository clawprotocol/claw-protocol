import { describe, expect, it } from "vitest";
import {
  extractAgreementIdFromSendReturnUrl,
  safeReturnToForAgreement,
  parseTierIdParam,
  resolveCheckoutTier,
  CREATE_FLOW_CHECKOUT_DEFAULT_CADENCE,
  buildCreateFlowProCheckoutPath,
  isCreateFlowUpgradeReturnTo,
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
