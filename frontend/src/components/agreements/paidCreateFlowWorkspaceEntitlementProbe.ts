/**
 * Workspace / subscription entitlement probes for create flow — leaf module only.
 * Must not import authoritativeCreateFlowReviewShell, returningPaidCreateBootstrap, or handoff barrels.
 */

import { subscriptionTierForAccess } from "../../access/subscriptionEntitlementCache";
import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";

export function resolveWorkspaceProSubscriptionEntitled(): boolean {
  const subTier = subscriptionTierForAccess();
  return Boolean(subTier && tierAllowsAdvancedFullDraftReveal(subTier));
}

export function resolveCreateFlowWorkspaceProEntitled(): boolean {
  return resolveWorkspaceProSubscriptionEntitled() || readCachedWorkspaceProEntitlement();
}
