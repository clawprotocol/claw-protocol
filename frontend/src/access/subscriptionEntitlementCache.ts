/**
 * Server-backed subscription entitlement cache for accessResolver.
 */

import type { AccessTier } from "../access/types";
import { fetchSubscription, type SubscriptionRow } from "../launch/billingApi";
import { getOrgId } from "../launch/orgContext";
import { hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

const CACHE_KEY = "claw_subscription_entitlement_v1";

function isSubscriptionCheckoutReturnWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("premiumCompletion") === "1") return true;
    if (u.searchParams.get("checkout_session_id")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export type SubscriptionEntitlementSnapshot = {
  orgId: string;
  planCode: string | null;
  status: string | null;
  tier: AccessTier | null;
  fetchedAt: number;
};

function planCodeToTier(planCode: string | null | undefined): AccessTier | null {
  const code = String(planCode || "").trim().toLowerCase();
  if (!code) return null;
  if (code === "pro" || code === "team" || code === "business" || code === "enterprise") return "premium";
  if (code === "starter" || code === "standard") return "standard";
  if (code === "free" || code === "trial") return "free";
  return null;
}

export function readCachedSubscriptionEntitlement(): SubscriptionEntitlementSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubscriptionEntitlementSnapshot;
    if (!parsed?.orgId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSubscriptionEntitlement(row: SubscriptionRow | null, orgId: string): SubscriptionEntitlementSnapshot {
  const planCode = row?.plan_code ?? null;
  const status = row?.status ?? null;
  const active = String(status || "").toLowerCase() === "active";
  const tier = active ? planCodeToTier(planCode) : null;
  const snap: SubscriptionEntitlementSnapshot = {
    orgId,
    planCode,
    status,
    tier,
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
  return snap;
}

export function clearCachedSubscriptionEntitlement(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export async function refreshSubscriptionEntitlement(orgId?: string): Promise<SubscriptionEntitlementSnapshot | null> {
  const oid = (orgId ?? getOrgId()).trim();
  if (!oid) return null;
  const { data, error, noSubscription, authFailure } = await fetchSubscription(oid);
  if (error) {
    const existing = readCachedSubscriptionEntitlement();
    if (existing?.orgId === oid && existing.tier) {
      return existing;
    }
    // Auth/API failure must not invent a free entitlement (401/403 ≠ no plan).
    if (authFailure) return null;
    return writeCachedSubscriptionEntitlement(null, oid);
  }
  if (noSubscription || !data) {
    const existing = readCachedSubscriptionEntitlement();
    if (
      existing?.orgId === oid &&
      existing.tier &&
      (hasPaidPremiumCompletionSession() || isSubscriptionCheckoutReturnWindow())
    ) {
      return existing;
    }
    return writeCachedSubscriptionEntitlement(null, oid);
  }
  return writeCachedSubscriptionEntitlement(data, oid);
}

export function subscriptionTierForAccess(): AccessTier | null {
  const cached = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (!cached || cached.orgId !== oid) return null;
  if (Date.now() - cached.fetchedAt > 6 * 60 * 60 * 1000) return null;
  return cached.tier;
}
