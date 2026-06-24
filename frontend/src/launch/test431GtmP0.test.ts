/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess } from "../access/accessResolver";
import {
  clearCachedSubscriptionEntitlement,
  writeCachedSubscriptionEntitlement,
} from "../access/subscriptionEntitlementCache";
import { getOrgId, setOrgId } from "../launch/orgContext";
import { LAWDOG_NAV_ITEMS } from "../launch/LawdogProductNav";
import {
  handleCheckoutReturnEntitlement,
  readCheckoutSessionIdFromUrl,
} from "../launch/checkoutReturnEntitlement";
import { resolvePaidProAgreementAuthoritative } from "../components/agreements/paidProAgreementAuthority";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import { clearPaidPremiumCompletionSession, markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

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

describe("TEST431 — P0 GTM auth, Stripe entitlement, affiliate nav", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setOrgId("org-test431");
    clearCachedSubscriptionEntitlement();
    clearPaidPremiumCompletionSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sidebar affiliate nav routes to opportunity dashboard", () => {
    const affiliate = LAWDOG_NAV_ITEMS.find((i) => i.id === "affiliate");
    expect(affiliate?.path).toBe("/app/opportunity");
  });

  it("server subscription cache drives access tier", () => {
    writeCachedSubscriptionEntitlement(
      { org_id: "org-test431", plan_code: "pro", status: "active" },
      "org-test431",
    );
    const access = resolveAccess();
    expect(access.tier).toBe("premium");
    expect(access.sourcesTried[0]?.id).toBe("server_subscription");
  });

  it("paid user tier from server subscription authorizes Pro", () => {
    writeCachedSubscriptionEntitlement(
      { org_id: "org-test431", plan_code: "pro", status: "active" },
      "org-test431",
    );
    const meta = resolvePaidProAgreementAuthoritative({
      draft: minimalDraft(),
      tier: "premium",
      premiumCompletionSnapshot: null,
      includeLocalCompletionMarker: false,
    });
    expect(meta.authoritative).toBe(true);
    expect(meta.reason).toBe("tier_allows_advanced_full_draft");
  });

  it("session marker alone does not authorize without checkout return window when tier is free", () => {
    Object.defineProperty(window, "location", {
      value: { href: "https://lawdog.test/app/create", origin: "https://lawdog.test" },
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
    if (import.meta.env.PROD) {
      expect(meta.authoritative).toBe(false);
    } else {
      expect(meta.authoritative).toBe(true);
    }
  });

  it("paid checkout return window allows session marker in production", () => {
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
    expect(meta.authoritative).toBe(true);
    expect(meta.reason).toBe("paid_premium_completion_session");
  });

  it("reads checkout_session_id from return URL", () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=cs_test_431",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    expect(readCheckoutSessionIdFromUrl()).toBe("cs_test_431");
  });

  it("verify checkout return refreshes entitlement cache", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?checkout_session_id=cs_test_verify",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("verify-checkout-session")) {
        const body = { ok: true, subscription: { plan_code: "pro", status: "active", org_id: "org-test431" } };
        return {
          ok: true,
          text: async () => JSON.stringify(body),
        };
      }
      if (u.includes("/subscriptions/")) {
        const body = { subscription: { plan_code: "pro", status: "active", org_id: "org-test431" } };
        return {
          ok: true,
          text: async () => JSON.stringify(body),
        };
      }
      return { ok: false, status: 404, text: async () => "not found" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await handleCheckoutReturnEntitlement();
    expect(ok).toBe(true);
    expect(getOrgId()).toBe("org-test431");
    const access = resolveAccess();
    expect(access.tier).toBe("premium");
  });
});
