/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedSubscriptionEntitlement,
  readCachedSubscriptionEntitlement,
} from "../access/subscriptionEntitlementCache";
import { setOrgId } from "../launch/orgContext";
import {
  clearPaidPremiumCompletionSession,
  hasStoredPaidPremiumCompletionSession,
} from "../components/agreements/premiumCompletionStorage";
import { handleCheckoutReturnEntitlement } from "../launch/checkoutReturnEntitlement";
import { resolvePaidProAgreementAuthoritative } from "../components/agreements/paidProAgreementAuthority";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

const minimalDraft = (): ParsedDraftShape => ({
  title: "Test",
  jurisdiction: "DE",
  parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
  purpose: "Purpose",
  payment_terms: "$1",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: false },
});

describe("checkoutReturnEntitlement fail-closed", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setOrgId("org-checkout-test");
    clearCachedSubscriptionEntitlement();
    clearPaidPremiumCompletionSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not grant paid markers when verify fails", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=cs_fail",
        origin: "https://lawdog.test",
        pathname: "/app/create",
        search: "?premiumCompletion=1&checkout_session_id=cs_fail",
      },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ detail: { code: "checkout_verification_failed" } }),
      })),
    );

    const result = await handleCheckoutReturnEntitlement();
    expect(result.ok).toBe(false);
    expect(hasStoredPaidPremiumCompletionSession()).toBe(false);
    expect(readCachedSubscriptionEntitlement()?.tier ?? null).toBeNull();
  });

  it("grants paid state only after successful verify with active subscription", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=cs_ok",
        origin: "https://lawdog.test",
        pathname: "/app/create",
        search: "?premiumCompletion=1&checkout_session_id=cs_ok",
      },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("verify-checkout-session")) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                subscription: { plan_code: "pro", status: "active", org_id: "org-checkout-test" },
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );

    const result = await handleCheckoutReturnEntitlement();
    expect(result.ok).toBe(true);
    expect(hasStoredPaidPremiumCompletionSession()).toBe(true);
    expect(readCachedSubscriptionEntitlement()?.tier).toBe("premium");
  });

  it("premiumCompletion alone does not authorize Pro without server entitlement", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://lawdog.test/app/create?premiumCompletion=1", origin: "https://lawdog.test" },
      writable: true,
      configurable: true,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    const meta = resolvePaidProAgreementAuthoritative({
      draft: minimalDraft(),
      tier: "free",
      premiumCompletionSnapshot: null,
      includeLocalCompletionMarker: false,
    });
    expect(meta.authoritative).toBe(false);
  });
});
