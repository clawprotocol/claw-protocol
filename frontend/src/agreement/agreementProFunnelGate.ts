import {
  hasOneTimeAgreementUnlock,
  hasSimpleFlowSendUnlocked,
} from "../launch/simpleFlowSendUnlock";
import { fetchAgreementUsageSummary } from "./agreementWorkspaceApi";

let workspaceProResolved: boolean | null = null;

export function invalidateWorkspaceProEntitlementCache(): void {
  workspaceProResolved = null;
}

export function readCachedWorkspaceProEntitlement(): boolean {
  return workspaceProResolved === true;
}

/** Vitest: seed workspace billing resolution without network. */
export function markWorkspaceProEntitlementResolvedForTests(entitled: boolean | null): void {
  workspaceProResolved = entitled;
}

/** Workspace billing: Pro / paid plan for the current org (cached until invalidated). */
export async function fetchWorkspaceProEntitlement(): Promise<boolean> {
  if (workspaceProResolved !== null) return workspaceProResolved;
  const res = await fetchAgreementUsageSummary();
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
