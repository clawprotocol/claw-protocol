/**
 * Synchronous paid/pro entitlement probes for Dashboard → Create before async billing settles.
 * Leaf module — must not import authoritativeCreateFlowReviewShell or returningPaidCreateBootstrap.
 */

import {
  readCachedSubscriptionEntitlement,
  subscriptionTierForAccess,
} from "../../access/subscriptionEntitlementCache";
import {
  readCachedWorkspaceProEntitlement,
  readPersistedWorkspaceUsageTierPaid,
} from "../../agreement/agreementProFunnelGate";
import { getOrgId } from "../../launch/orgContext";
import {
  hasPaidDashboardCreateContextActive,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "../../launch/paidDashboardCreateContext";
import { tierAllowsAdvancedFullDraftReveal, peekAdvancedFullDraftCheckoutGrant } from "./agreementAdvancedDraftAccess";
import {
  hasPaidPremiumCompletionSessionForCreateProbe,
  readPremiumCompletionSnapshotPremiumAcceptedForCreateProbe,
} from "./paidCreateFlowPremiumSessionProbe";

function readStaleSubscriptionCachePremium(): boolean {
  const cached = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (!cached || cached.orgId !== oid) return false;
  const statusActive = String(cached.status || "").toLowerCase() === "active";
  const tierOk = Boolean(cached.tier && tierAllowsAdvancedFullDraftReveal(cached.tier));
  return statusActive && tierOk;
}

function resolveWorkspaceProSubscriptionEntitledForCreateProbe(): boolean {
  const subTier = subscriptionTierForAccess();
  return Boolean(subTier && tierAllowsAdvancedFullDraftReveal(subTier));
}

function resolveCreateFlowWorkspaceProEntitledForCreateProbe(): boolean {
  return resolveWorkspaceProSubscriptionEntitledForCreateProbe() || readCachedWorkspaceProEntitlement();
}

/**
 * Synchronous paid/pro probes for Dashboard → Create before async billing fetch settles.
 * Uses subscription cache, workspace entitlement cache, persisted usage tier, and session checkout markers.
 */
export function resolveProvisionalWorkspaceProEntitledForCreate(): boolean {
  if (hasPaidDashboardCreateContextActive()) return true;
  if (shouldFailClosedBypassForAuthenticatedWorkspaceCreate()) return true;
  if (resolveCreateFlowWorkspaceProEntitledForCreateProbe()) return true;
  if (readCachedWorkspaceProEntitlement()) return true;
  if (readPersistedWorkspaceUsageTierPaid()) return true;
  if (resolveWorkspaceProSubscriptionEntitledForCreateProbe()) return true;
  if (readStaleSubscriptionCachePremium()) return true;
  const sub = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (sub?.orgId === oid) {
    const statusActive = String(sub.status || "").toLowerCase() === "active";
    const tierOk = Boolean(sub.tier && tierAllowsAdvancedFullDraftReveal(sub.tier));
    if (statusActive && tierOk) return true;
  }
  if (hasPaidPremiumCompletionSessionForCreateProbe()) return true;
  if (readPremiumCompletionSnapshotPremiumAcceptedForCreateProbe()) return true;
  if (peekAdvancedFullDraftCheckoutGrant()) return true;
  return false;
}
