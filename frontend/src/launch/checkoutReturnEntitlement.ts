/**
 * Verify Stripe checkout return and refresh server entitlement.
 */

import { refreshSubscriptionEntitlement, writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import { verifyBillingCheckoutSession } from "../launch/billingCheckoutApi";
import { markAdvancedFullDraftCheckoutGranted } from "../components/agreements/agreementAdvancedDraftAccess";
import { markPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";
import { getOrgId } from "../launch/orgContext";
import { writePaidCheckoutOrgId } from "../launch/paidCheckoutOrgContext";
import {
  bindAfterPayPersistAgreementId,
  readVerifiedAfterPayAgreementId,
} from "./afterPayPersistResume";

export function readCheckoutSessionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = new URL(window.location.href).searchParams.get("checkout_session_id");
    return id?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Signals for the after-pay create-flow handoff.
 * Last-good: premiumCompletion=1 and/or a Stripe checkout_session_id, not the demo-only grant.
 */
export type AfterPayHandoffSignals = {
  premiumCompletionInUrl: boolean;
  checkoutSessionId: string | null;
  hasPaidSession: boolean;
  hasCheckoutGrant: boolean;
  awaitingProCheckoutResume: boolean;
};

/** True when create-flow should enter the after-pay Pro generation effect. */
export function isAfterPayPremiumCompletionReturn(s: AfterPayHandoffSignals): boolean {
  if (s.premiumCompletionInUrl) return true;
  if (s.hasCheckoutGrant && s.awaitingProCheckoutResume) return true;
  const cs = (s.checkoutSessionId || "").trim();
  if (!cs) return false;
  // checkout_session_id after URL strip: only with paid session, resume, or grant — not a lone leftover.
  return s.hasPaidSession || s.awaitingProCheckoutResume || s.hasCheckoutGrant;
}

/**
 * First failing predicate in the Stripe walk: missing demo grant must not refuse a real after-pay
 * return (premiumCompletion=1, checkout_session_id, or settled paid session).
 */
export function shouldRefuseAfterPayPremiumCompletionForMissingGrant(s: AfterPayHandoffSignals): boolean {
  if (!isAfterPayPremiumCompletionReturn(s)) return false;
  if (s.premiumCompletionInUrl) return false;
  if ((s.checkoutSessionId || "").trim()) return false;
  if (s.hasPaidSession) return false;
  return !s.hasCheckoutGrant;
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
    // Same-tab demo grant used to be set in applyConfirmedSettlement; Stripe return never set it.
    markAdvancedFullDraftCheckoutGranted();
    writePaidCheckoutOrgId(oid);
    const paidPersistId = readVerifiedAfterPayAgreementId(verified);
    if (paidPersistId) bindAfterPayPersistAgreementId(paidPersistId);
    return true;
  } catch {
    return false;
  }
}
