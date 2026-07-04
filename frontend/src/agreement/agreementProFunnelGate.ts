import { getOrgId } from "../launch/orgContext";
import {
  hasOneTimeAgreementUnlock,
  hasSimpleFlowSendUnlocked,
} from "../launch/simpleFlowSendUnlock";
import { fetchAgreementUsageSummary } from "./agreementWorkspaceApi";

let workspaceProResolved: boolean | null = null;

const WORKSPACE_USAGE_TIER_CACHE_KEY = "claw_workspace_usage_tier_v1";

type PersistedWorkspaceUsageTier = {
  orgId: string;
  tier: string;
  fetchedAt: number;
};

export function invalidateWorkspaceProEntitlementCache(): void {
  workspaceProResolved = null;
}

export function clearPersistedWorkspaceUsageTierCache(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(WORKSPACE_USAGE_TIER_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedWorkspaceUsageTierPaid(): boolean {
  if (typeof localStorage === "undefined") return false;
  const oid = getOrgId().trim();
  if (!oid) return false;
  try {
    const raw = localStorage.getItem(WORKSPACE_USAGE_TIER_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceUsageTier>;
    if (parsed?.orgId !== oid) return false;
    return String(parsed.tier || "").trim().toLowerCase() === "paid";
  } catch {
    return false;
  }
}

export function writePersistedWorkspaceUsageTier(tier: string, orgId?: string): void {
  const oid = (orgId ?? getOrgId()).trim();
  if (!oid) return;
  const snap: PersistedWorkspaceUsageTier = {
    orgId: oid,
    tier: String(tier || "").trim().toLowerCase(),
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(WORKSPACE_USAGE_TIER_CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

/** Vitest: seed persisted usage tier without network. */
export function markPersistedWorkspaceUsageTierForTests(tier: string | null, orgId?: string): void {
  if (tier === null) {
    clearPersistedWorkspaceUsageTierCache();
    return;
  }
  writePersistedWorkspaceUsageTier(tier, orgId);
}

export function readCachedWorkspaceProEntitlement(): boolean {
  return workspaceProResolved === true || readPersistedWorkspaceUsageTierPaid();
}

/** Vitest: seed workspace billing resolution without network. */
export function markWorkspaceProEntitlementResolvedForTests(entitled: boolean | null): void {
  workspaceProResolved = entitled;
}

/** Workspace billing: Pro / paid plan for the current org (cached until invalidated). */
export async function fetchWorkspaceProEntitlement(): Promise<boolean> {
  if (workspaceProResolved !== null) return workspaceProResolved;
  const res = await fetchAgreementUsageSummary();
  if (res.ok && res.data?.tier) {
    writePersistedWorkspaceUsageTier(res.data.tier);
  }
  workspaceProResolved = Boolean(res.ok && res.data && res.data.tier === "paid");
  return workspaceProResolved;
}

export function hasSessionAgreementSendUnlock(agreementId: string | undefined): boolean {
  const id = (agreementId || "").trim();
  if (!id) return false;
  return hasSimpleFlowSendUnlocked(id) || hasOneTimeAgreementUnlock(id);
}

const POST_PRO_UNLOCK_CELEBRATE_KEY = (id: string) =>
  `claw_pro_unlock_celebrate_v1_${encodeURIComponent(id.trim())}`;

/** After checkout: show one compact non-blocking success strip on the agreement until dismissed. */
export function markPostProUnlockCelebrate(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(POST_PRO_UNLOCK_CELEBRATE_KEY(id), "1");
  } catch {
    /* ignore */
  }
}

export function peekPostProUnlockCelebrate(agreementId: string): boolean {
  const id = agreementId.trim();
  if (!id) return false;
  try {
    return sessionStorage.getItem(POST_PRO_UNLOCK_CELEBRATE_KEY(id)) === "1";
  } catch {
    return false;
  }
}

export function clearPostProUnlockCelebrate(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(POST_PRO_UNLOCK_CELEBRATE_KEY(id));
  } catch {
    /* ignore */
  }
}
