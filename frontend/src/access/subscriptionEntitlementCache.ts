/**
 * Server-backed subscription entitlement cache for accessResolver.
 */

import type { AccessTier } from "../access/types";
import { fetchSubscription, type SubscriptionRow } from "../launch/billingApi";
import { getOrgId } from "../launch/orgContext";

const CACHE_KEY = "claw_subscription_entitlement_v1";

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
  const { data } = await fetchSubscription(oid);
  return writeCachedSubscriptionEntitlement(data, oid);
}

export function subscriptionTierForAccess(): AccessTier | null {
  const cached = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (!cached || cached.orgId !== oid) return null;
  if (Date.now() - cached.fetchedAt > 6 * 60 * 60 * 1000) return null;
  return cached.tier;
}
