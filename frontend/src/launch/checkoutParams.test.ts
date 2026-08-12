import { describe, expect, it } from "vitest";
import {
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
