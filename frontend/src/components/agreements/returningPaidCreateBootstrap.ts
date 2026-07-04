/**
 * Returning paid Dashboard → Create: bootstrap the same session shape as post-checkout Pro
 * (skip free starter summary, checkout, and degraded review-only branches).
 */

import type { AccessTier } from "../../access/types";
import { readCachedSubscriptionEntitlement } from "../../access/subscriptionEntitlementCache";
import { getOrgId } from "../../launch/orgContext";
import { tierAllowsAdvancedFullDraftReveal, peekAdvancedFullDraftCheckoutGrant } from "./agreementAdvancedDraftAccess";
import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import {
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
  resolveCreateFlowWorkspaceProEntitled,
  shouldUsePaidProCreateFlowReviewShell,
  type ResolveAuthoritativeCreateFlowReviewShellInput,
} from "./authoritativeCreateFlowReviewShell";
import {
  hasCurrentSessionProEntitlement,
  hasCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";

export type ResolveReturningPaidCreateEligibleInput = {
  tier?: AccessTier;
  workspaceProEntitled?: boolean;
  premiumPersistedFlowActive?: boolean;
  premiumSendPathUnlocked?: boolean;
  premiumPostCheckoutPhase?: string | null;
  paidProAuthoritative?: boolean;
  premiumCheckoutCompleted?: boolean;
};

/**
 * Synchronous paid/pro probes for Dashboard → Create before async billing fetch settles.
 * Uses subscription cache, workspace entitlement cache, and session checkout markers.
 */
export function resolveProvisionalWorkspaceProEntitledForCreate(): boolean {
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  if (readCachedWorkspaceProEntitlement()) return true;
  const sub = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (sub?.orgId === oid) {
    const statusActive = String(sub.status || "").toLowerCase() === "active";
    const tierOk = Boolean(sub.tier && tierAllowsAdvancedFullDraftReveal(sub.tier));
    if (statusActive && tierOk) return true;
  }
  if (hasPaidPremiumCompletionSession()) return true;
  if (peekAdvancedFullDraftCheckoutGrant()) return true;
  return false;
}

/** Paid workspace / subscription user creating another agreement on /app/create. */
export function resolveReturningPaidCreateEligible(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return true;
  if (input.workspaceProEntitled) return true;
  if (resolveProvisionalWorkspaceProEntitledForCreate()) return true;
  if (
    shouldUsePaidProCreateFlowReviewShell({
      workspaceProEntitled: input.workspaceProEntitled,
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
      paidProAuthoritative: input.paidProAuthoritative,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    })
  ) {
    return true;
  }
  if (hasCurrentSessionProEntitlement() || hasCurrentSessionProIntent()) return true;
  if (input.premiumPersistedFlowActive) return true;
  if (input.premiumPostCheckoutPhase === "processing") return true;
  if (input.paidProAuthoritative) return true;
  return false;
}

/**
 * Paid / returning Dashboard → Create must never hit the public free multi-party Pro gate.
 * Anonymous/free users still see the gate when assessStarterComplexityGate requires it.
 */
export function shouldBypassStarterMultiPartyProGateForPaidCreate(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  if (resolveReturningPaidCreateEligible(input)) return true;
  if (
    isCreateFlowPaidAcceptedOrAuthoritativeActive({
      workspaceProEntitled:
        input.workspaceProEntitled ?? resolveProvisionalWorkspaceProEntitledForCreate(),
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
      paidProAuthoritative: input.paidProAuthoritative,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    })
  ) {
    return true;
  }
  return false;
}

export const STARTER_MULTI_PARTY_PRO_GATE_PAID_BYPASS_HELPER =
  "shouldBypassStarterMultiPartyProGateForPaidCreate";

export type ReturningPaidCreateSubmitBootstrapPlan = {
  markProIntent: true;
  markProEntitlementSource: "entitled_rewrite";
  premiumPersistedFlowActive: true;
  premiumSendPathUnlocked: true;
  premiumPostCheckoutPhase: "processing";
  createFlowPhase: "generating_draft";
  displayPhase: "generating_draft";
};

export function planReturningPaidCreateSubmitBootstrap(
  input: ResolveReturningPaidCreateEligibleInput,
): ReturningPaidCreateSubmitBootstrapPlan | null {
  if (!resolveReturningPaidCreateEligible(input)) return null;
  return {
    markProIntent: true,
    markProEntitlementSource: "entitled_rewrite",
    premiumPersistedFlowActive: true,
    premiumSendPathUnlocked: true,
    premiumPostCheckoutPhase: "processing",
    createFlowPhase: "generating_draft",
    displayPhase: "generating_draft",
  };
}

/** Block AgreementReadySummaryCard / Review agreement + Edit details for returning paid create. */
export function shouldSuppressIntakeCanonicalPostGeneration(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  premiumPersistedFlowActive?: boolean;
  premiumPostCheckoutPhase?: string | null;
  paidProAuthoritative?: boolean;
  premiumPaidDocumentSurface?: boolean;
  showPrimaryGuidedCompletion?: boolean;
}): boolean {
  if (input.paidProAuthoritative || input.premiumPaidDocumentSurface || input.premiumPersistedFlowActive) {
    return true;
  }
  if (input.showPrimaryGuidedCompletion) return true;
  if (shouldUsePaidProCreateFlowReviewShell(input.shellInput ?? {})) return true;
  return resolveReturningPaidCreateEligible({
    tier: input.shellInput?.tier,
    workspaceProEntitled: input.shellInput?.workspaceProEntitled,
    premiumPersistedFlowActive: input.premiumPersistedFlowActive,
    premiumSendPathUnlocked: input.shellInput?.premiumSendPathUnlocked,
    premiumPostCheckoutPhase: input.premiumPostCheckoutPhase,
  });
}

export const RETURNING_PAID_CREATE_BOOTSTRAP_HELPER = "planReturningPaidCreateSubmitBootstrap";
