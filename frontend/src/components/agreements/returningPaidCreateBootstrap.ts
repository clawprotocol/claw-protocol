/**
 * Returning paid Dashboard → Create: bootstrap the same session shape as post-checkout Pro
 * (skip free starter summary, checkout, and degraded review-only branches).
 */

import type { AccessTier } from "../../access/types";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import {
  resolveCreateFlowWorkspaceProEntitled,
  shouldUsePaidProCreateFlowReviewShell,
  type ResolveAuthoritativeCreateFlowReviewShellInput,
} from "./authoritativeCreateFlowReviewShell";
import {
  hasCurrentSessionProEntitlement,
  hasCurrentSessionProIntent,
} from "./paidProSessionEligibility";

export type ResolveReturningPaidCreateEligibleInput = {
  tier?: AccessTier;
  workspaceProEntitled?: boolean;
  premiumPersistedFlowActive?: boolean;
  premiumSendPathUnlocked?: boolean;
  premiumPostCheckoutPhase?: string | null;
};

/** Paid workspace / subscription user creating another agreement on /app/create. */
export function resolveReturningPaidCreateEligible(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return true;
  if (input.workspaceProEntitled) return true;
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  if (
    shouldUsePaidProCreateFlowReviewShell({
      workspaceProEntitled: input.workspaceProEntitled,
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
    })
  ) {
    return true;
  }
  if (hasCurrentSessionProEntitlement() || hasCurrentSessionProIntent()) return true;
  if (input.premiumPersistedFlowActive) return true;
  if (input.premiumPostCheckoutPhase === "processing") return true;
  return false;
}

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
