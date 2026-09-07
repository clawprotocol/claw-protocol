/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  clearPreAuthCheckoutAgreementId,
  readPreAuthCheckoutAgreementId,
  rememberPreAuthCheckoutAgreementId,
} from "../auth/preAuthCheckoutAgreement";
import { ACTIVE_AGREEMENT_GENERATION_STORAGE_KEY } from "../lib/agreementGenerationId";
import { buildCreateFlowCheckoutHref, sanitizeConversionCheckoutDest } from "./checkoutParams";

const PERSIST_ID = "d0e90b0c-f301-4b18-a755-dea64b4ac6cd";
const ACTIVE_GEN_ID = "9216ed40-eb15-4356-9ba4-a7ada836a0d6";

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

  it("active-gen-only session (pre_auth null) first hop is clean and syncs pre_auth", () => {
    sessionStorage.setItem(ACTIVE_AGREEMENT_GENERATION_STORAGE_KEY, ACTIVE_GEN_ID);
    expect(readPreAuthCheckoutAgreementId()).toBeNull();
    const href = buildCreateFlowCheckoutHref({ cadence: "monthly" });
    expect(href).toBe(
      `/app/checkout/${ACTIVE_GEN_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(href).not.toContain("restore=starterReview");
    expect(href).not.toContain("starterReview");
    expect(href).not.toContain(CREATE_FLOW_CHECKOUT_AGREEMENT_ID);
    expect(readPreAuthCheckoutAgreementId()).toBe(ACTIVE_GEN_ID);
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

  it("claim/sanitize of dirty hop with only active generation pins that AID", () => {
    sessionStorage.setItem(ACTIVE_AGREEMENT_GENERATION_STORAGE_KEY, ACTIVE_GEN_ID);
    const cleaned = sanitizeConversionCheckoutDest({ dest: DIRTY_PLACEHOLDER_HOP });
    expect(cleaned).toBe(
      `/app/checkout/${ACTIVE_GEN_ID}?tier=pro&cadence=monthly&returnTo=${encodeURIComponent("/app/create")}`,
    );
    expect(cleaned).not.toContain("starterReview");
    expect(readPreAuthCheckoutAgreementId()).toBe(ACTIVE_GEN_ID);
  });

  it("keeps unpaid Back restore decoy when session has no persist or active AID", () => {
    expect(buildCreateFlowCheckoutHref({ cadence: "monthly" })).toBe(DIRTY_PLACEHOLDER_HOP);
    expect(sanitizeConversionCheckoutDest({ dest: DIRTY_PLACEHOLDER_HOP })).toBe(DIRTY_PLACEHOLDER_HOP);
    expect(readPreAuthCheckoutAgreementId()).toBeNull();
  });

  it("pre_auth wins over a different active generation id", () => {
    rememberPreAuthCheckoutAgreementId(PERSIST_ID);
    sessionStorage.setItem(ACTIVE_AGREEMENT_GENERATION_STORAGE_KEY, ACTIVE_GEN_ID);
    const href = buildCreateFlowCheckoutHref({ cadence: "monthly" });
    expect(href).toContain(PERSIST_ID);
    expect(href).not.toContain(ACTIVE_GEN_ID);
    expect(readPreAuthCheckoutAgreementId()).toBe(PERSIST_ID);
  });
});
