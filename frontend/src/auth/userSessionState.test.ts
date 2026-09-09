/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { readCachedSubscriptionEntitlement, writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { hasPaidPremiumCompletionSession, markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { hasCurrentSessionProEntitlement, markCurrentSessionProEntitlementComplete, markCurrentSessionProIntent } from "../components/agreements/paidProSessionEligibility";
import { createDemoSessionUser, hasDemoSessionUser } from "../launch/guestCheckoutAuthority";
import { getOrgId, setOrgId } from "../launch/orgContext";
import { readPaidCheckoutOrgId, writePaidCheckoutOrgId } from "../launch/paidCheckoutOrgContext";
import { getCachedAccessToken, setCachedAccessToken } from "./authAccessTokenCache";
import { clearLawdogUserSessionState } from "./userSessionState";

describe("user sign-out state", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does not leave paid or account authority for the next browser user", () => {
    setOrgId("user-paid-one");
    setCachedAccessToken("account-one-token");
    writeCachedSubscriptionEntitlement(
      { org_id: "user-paid-one", plan_code: "pro", status: "active" },
      "user-paid-one",
    );
    writePaidCheckoutOrgId("user-paid-one");
    markPaidPremiumCompletionSession();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    createDemoSessionUser({ displayName: "Demo", settlementReceiptId: "receipt-one" });

    clearLawdogUserSessionState();

    expect(getCachedAccessToken()).toBe("");
    expect(readCachedSubscriptionEntitlement()).toBeNull();
    expect(readPaidCheckoutOrgId()).toBeNull();
    expect(hasPaidPremiumCompletionSession()).toBe(false);
    expect(hasCurrentSessionProEntitlement()).toBe(false);
    expect(hasDemoSessionUser()).toBe(false);
    expect(getOrgId()).toBe("local-org");
  });
});
