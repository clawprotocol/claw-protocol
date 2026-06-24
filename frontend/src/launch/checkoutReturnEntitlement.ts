/**
 * Verify Stripe checkout return and refresh server entitlement.
 */

import { refreshSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { verifyBillingCheckoutSession } from "../launch/billingCheckoutApi";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

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
    await verifyBillingCheckoutSession(sessionId);
    await refreshSubscriptionEntitlement();
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    return true;
  } catch {
    return false;
  }
}
