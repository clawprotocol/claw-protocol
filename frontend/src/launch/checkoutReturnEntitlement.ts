/**
 * Verify Stripe checkout return and refresh server entitlement.
 */

import { refreshSubscriptionEntitlement, writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { verifyBillingCheckoutSession } from "../launch/billingCheckoutApi";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { getOrgId } from "../launch/orgContext";
import { writePaidCheckoutOrgId } from "../launch/paidCheckoutOrgContext";

export function readCheckoutSessionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = new URL(window.location.href).searchParams.get("checkout_session_id");
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export async function handleCheckoutReturnEntitlement(): Promise<boolean> {
  const sessionId = readCheckoutSessionIdFromUrl();
  if (!sessionId) return false;
  try {
    const verified = await verifyBillingCheckoutSession(sessionId);
    const oid = getOrgId().trim();
    if (verified.subscription?.plan_code && oid) {
      writeCachedSubscriptionEntitlement(
        {
          org_id: oid,
          plan_code: verified.subscription.plan_code,
          status: verified.subscription.status ?? "active",
        },
        oid,
      );
    } else {
      await refreshSubscriptionEntitlement(oid);
    }
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    writePaidCheckoutOrgId(oid);
    return true;
  } catch {
    return false;
  }
}
