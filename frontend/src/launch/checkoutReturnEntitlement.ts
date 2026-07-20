/**
 * Verify Stripe checkout return and refresh server entitlement.
 */

import { refreshSubscriptionEntitlement, writeCachedSubscriptionEntitlement, clearCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { verifyBillingCheckoutSession } from "../launch/billingCheckoutApi";
import { clearPaidPremiumCompletionSession, markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { getOrgId } from "../launch/orgContext";
import { writePaidCheckoutOrgId, clearPaidCheckoutOrgId } from "../launch/paidCheckoutOrgContext";
import { markAdvancedFullDraftCheckoutGranted, clearAdvancedFullDraftCheckoutGranted } from "../components/agreements/agreementAdvancedDraftAccess";

export type CheckoutReturnEntitlementResult =
  | { ok: true }
  | { ok: false; reason: "no_session" | "verify_failed" | "no_entitlement" };

export function readCheckoutSessionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = new URL(window.location.href).searchParams.get("checkout_session_id");
    return id?.trim() || null;
  } catch {
    return null;
  }
}

function isCheckoutReturnUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("premiumCompletion") === "1" || Boolean(u.searchParams.get("checkout_session_id"));
  } catch {
    return false;
  }
}

function stripCheckoutReturnQueryParams(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    let changed = false;
    if (u.searchParams.has("checkout_session_id")) {
      u.searchParams.delete("checkout_session_id");
      changed = true;
    }
    if (u.searchParams.has("premiumCompletion")) {
      u.searchParams.delete("premiumCompletion");
      changed = true;
    }
    if (changed) {
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}${u.hash}`);
    }
  } catch {
    /* ignore */
  }
}

function clearCheckoutReturnPaidMarkers(): void {
  clearPaidPremiumCompletionSession();
  clearPaidCheckoutOrgId();
  clearAdvancedFullDraftCheckoutGranted();
  clearCachedSubscriptionEntitlement();
}

export async function handleCheckoutReturnEntitlement(): Promise<CheckoutReturnEntitlementResult> {
  const sessionId = readCheckoutSessionIdFromUrl();
  if (!sessionId) {
    if (isCheckoutReturnUrl()) {
      clearCheckoutReturnPaidMarkers();
      stripCheckoutReturnQueryParams();
      return { ok: false, reason: "verify_failed" };
    }
    return { ok: false, reason: "no_session" };
  }

  const oid = getOrgId().trim();
  try {
    const verified = await verifyBillingCheckoutSession(sessionId);
    const planCode = verified.subscription?.plan_code?.trim();
    const status = String(verified.subscription?.status || "").toLowerCase();
    if (!planCode || status !== "active") {
      clearCheckoutReturnPaidMarkers();
      stripCheckoutReturnQueryParams();
      return { ok: false, reason: "no_entitlement" };
    }
    if (oid) {
      writeCachedSubscriptionEntitlement(
        {
          org_id: oid,
          plan_code: planCode,
          status: verified.subscription?.status ?? "active",
        },
        oid,
      );
    } else {
      await refreshSubscriptionEntitlement(oid);
    }
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    markAdvancedFullDraftCheckoutGranted();
    writePaidCheckoutOrgId(oid);
    stripCheckoutReturnQueryParams();
    return { ok: true };
  } catch {
    clearCheckoutReturnPaidMarkers();
    stripCheckoutReturnQueryParams();
    return { ok: false, reason: "verify_failed" };
  }
}
