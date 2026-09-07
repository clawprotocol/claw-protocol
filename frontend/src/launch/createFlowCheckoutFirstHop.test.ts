/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  clearPreAuthCheckoutAgreementId,
  rememberPreAuthCheckoutAgreementId,
} from "../auth/preAuthCheckoutAgreement";
import { buildCreateFlowCheckoutHref, sanitizeConversionCheckoutDest } from "./checkoutParams";

const PERSIST_ID = "d0e90b0c-f301-4b18-a755-dea64b4ac6cd";

const DIRTY_PLACEHOLDER_HOP = `/app/checkout/${CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent(
  "/app/create?restore=starterReview",
)}`;

describe("placeholder __claw_create_checkout__ first hop + persist in session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPreAuthCheckoutAgreementId();
  });

  it("Continue-with-Pro reads session persist and omits restore=starterReview", () => {
    rememberPreAuthCheckoutAgreementId(PERSIST_ID);
    const href = buildCreateFlowCheckoutHref({ cadence: "monthly" });
    expect(href).toBe(
      `/app/checkout/${PERSIST_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(href).not.toContain("restore=starterReview");
    expect(href).not.toContain("starterReview");
    expect(href).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
  });

  it("claim/sanitize of the dirty placeholder hop pins persist AID and drops restore", () => {
    rememberPreAuthCheckoutAgreementId(PERSIST_ID);
    const cleaned = sanitizeConversionCheckoutDest({ dest: DIRTY_PLACEHOLDER_HOP });
    expect(cleaned).toBe(
      `/app/checkout/${PERSIST_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(cleaned).not.toContain("starterReview");
    expect(cleaned).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
  });

  it("keeps unpaid Back restore decoy when session has no persist ID", () => {
    expect(buildCreateFlowCheckoutHref({ cadence: "monthly" })).toBe(DIRTY_PLACEHOLDER_HOP);
    expect(sanitizeConversionCheckoutDest({ dest: DIRTY_PLACEHOLDER_HOP })).toBe(DIRTY_PLACEHOLDER_HOP);
  });
});
