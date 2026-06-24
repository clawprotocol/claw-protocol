/** @vitest-environment jsdom */
/**
 * TEST437 — subscription 404 for local-org must not poison post-checkout Pro completion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess } from "../../access/accessResolver";
import {
  clearCachedSubscriptionEntitlement,
  readCachedSubscriptionEntitlement,
  refreshSubscriptionEntitlement,
  writeCachedSubscriptionEntitlement,
} from "../../access/subscriptionEntitlementCache";
import { fetchSubscription } from "../../launch/billingApi";
import { setOrgId } from "../../launch/orgContext";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { resolvePaidProAgreementAuthoritative } from "./paidProAgreementAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { handleCheckoutReturnEntitlement } from "../../launch/checkoutReturnEntitlement";
import { TEST436_HOMEPAGE_INTAKE } from "./paidProTest436Fixtures";
import { test435Draft } from "./paidProTest435Fixtures";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildTest435ServerFullDraftWithRepairableStructureBreaks } from "./paidProTest435Fixtures";

const minimalDraft = (): ParsedDraftShape => test435Draft();

describe("TEST437 — subscription 404 does not poison post-checkout Pro completion", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setOrgId("local-org");
    clearCachedSubscriptionEntitlement();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetchSubscription treats HTTP 404 as no-subscription without error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "not found",
      })),
    );
    const result = await fetchSubscription("local-org");
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.noSubscription).toBe(true);
  });

  it("refresh on 404 clears tier to free without throwing", async () => {
    writeCachedSubscriptionEntitlement(
      { org_id: "local-org", plan_code: "pro", status: "active" },
      "local-org",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "not found",
      })),
    );
    const snap = await refreshSubscriptionEntitlement("local-org");
    expect(snap?.tier).toBeNull();
    expect(resolveAccess().tier).toBe("free");
  });

  it("premiumCompletion=1 + paid session marker authorizes Pro when subscription probe is empty", () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&restore=starterReview",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    expect(hasPaidPremiumCompletionSession()).toBe(true);

    const meta = resolvePaidProAgreementAuthoritative({
      draft: minimalDraft(),
      tier: "free",
      premiumCompletionSnapshot: null,
      includeLocalCompletionMarker: false,
    });
    expect(meta.authoritative).toBe(true);
    expect(meta.reason).toBe("paid_premium_completion_session");
    expect(resolveAccess().tier).toBe("free");
  });

  it("session marker alone does not authorize Pro outside checkout return window (TEST431 guard)", () => {
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
    }
  });

  it("checkout verify writes entitlement before subscription 404 refresh (Red Mesa post-checkout)", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=cs_test_437",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("verify-checkout-session")) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({ ok: true, subscription: { plan_code: "pro", status: "active" } }),
          };
        }
        if (u.includes("/subscriptions/")) {
          return { ok: false, status: 404, text: async () => "not found" };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );

    const ok = await handleCheckoutReturnEntitlement();
    expect(ok).toBe(true);
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    const cached = readCachedSubscriptionEntitlement();
    expect(cached?.tier).toBe("premium");
    expect(cached?.planCode).toBe("pro");

    const meta = resolvePaidProAgreementAuthoritative({
      draft: minimalDraft(),
      tier: resolveAccess().tier,
      premiumCompletionSnapshot: null,
      includeLocalCompletionMarker: false,
    });
    expect(meta.authoritative).toBe(true);
  });

  it("server_full_draft freeze + SoT still establishes after subscription 404 during intake restore", () => {
    writeCachedSubscriptionEntitlement(null, "local-org");
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });

    const serverDraft = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    const prepared = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      minimalDraft(),
      TEST436_HOMEPAGE_INTAKE,
      { surface: "test437_prepare" },
    );
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: minimalDraft(),
      intakeText: TEST436_HOMEPAGE_INTAKE,
      surface: "test437_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: minimalDraft(),
      intakeText: TEST436_HOMEPAGE_INTAKE,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(resolvePaidProAgreementAuthoritative({
      draft: minimalDraft(),
      tier: "free",
      premiumCompletionSnapshot: null,
      includeLocalCompletionMarker: false,
    }).authoritative).toBe(true);
  });
});
