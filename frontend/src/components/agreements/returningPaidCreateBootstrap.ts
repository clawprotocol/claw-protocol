/**
 * Returning paid Dashboard → Create: bootstrap the same session shape as post-checkout Pro
 * (skip free starter summary, checkout, and degraded review-only branches).
 */

import type { AccessTier } from "../../access/types";
import {
  readCachedSubscriptionEntitlement,
  subscriptionTierForAccess,
} from "../../access/subscriptionEntitlementCache";
import {
  fetchWorkspaceProEntitlement,
  readCachedWorkspaceProEntitlement,
  readPersistedWorkspaceUsageTierPaid,
} from "../../agreement/agreementProFunnelGate";
import { getOrgId } from "../../launch/orgContext";
import {
  hasPaidDashboardCreateContextActive,
  isAppCreatePath,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "../../launch/paidDashboardCreateContext";
import { tierAllowsAdvancedFullDraftReveal, peekAdvancedFullDraftCheckoutGrant } from "./agreementAdvancedDraftAccess";
import {
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
  resolveCreateFlowWorkspaceProEntitled,
  resolveWorkspaceProSubscriptionEntitled,
  shouldUsePaidProCreateFlowReviewShell,
  type ResolveAuthoritativeCreateFlowReviewShellInput,
} from "./authoritativeCreateFlowReviewShell";
import {
  hasCurrentSessionProEntitlement,
  hasCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { hasPaidPremiumCompletionSession, readPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import type { StarterComplexityGateAssessment } from "./starterMultiPartyProGate";

export type ResolveReturningPaidCreateEligibleInput = {
  tier?: AccessTier;
  workspaceProEntitled?: boolean;
  premiumPersistedFlowActive?: boolean;
  premiumSendPathUnlocked?: boolean;
  premiumPostCheckoutPhase?: string | null;
  paidProAuthoritative?: boolean;
  premiumCheckoutCompleted?: boolean;
};

export type PaidCreateGateBypassReasonCode =
  | "workspace_pro_entitled_state"
  | "workspace_pro_cached"
  | "workspace_usage_tier_persisted_paid"
  | "subscription_cache_active_premium"
  | "subscription_tier_for_access"
  | "create_flow_workspace_pro"
  | "premium_completion_session"
  | "premium_completion_snapshot"
  | "checkout_grant"
  | "tier_premium"
  | "paid_pro_authoritative"
  | "premium_persisted_flow"
  | "premium_send_path_unlocked"
  | "session_pro_entitlement"
  | "session_pro_intent"
  | "returning_paid_eligible"
  | "create_flow_paid_authoritative"
  | "paid_pro_review_shell"
  | "paid_dashboard_create_context"
  | "authenticated_workspace_session_fallback";

export type PaidCreateGateBypassDecision = {
  isAppCreate: boolean;
  partyCount: number | null;
  workspaceProEntitled: boolean;
  workspaceProCached: boolean;
  provisionalPaid: boolean;
  bypass: boolean;
  reason: string | null;
  reasonCodes: PaidCreateGateBypassReasonCode[];
};

export { isAppCreatePath };

function resolvePrimaryBypassReason(
  reasonCodes: PaidCreateGateBypassReasonCode[],
): string | null {
  if (reasonCodes.includes("paid_dashboard_create_context")) {
    return "paid_dashboard_create_context";
  }
  if (reasonCodes.includes("workspace_pro_entitled_state")) return "workspace_pro_entitled_state";
  if (reasonCodes.includes("workspace_usage_tier_persisted_paid")) {
    return "workspace_usage_tier_persisted_paid";
  }
  if (reasonCodes.includes("subscription_cache_active_premium")) {
    return "subscription_cache_active_premium";
  }
  if (reasonCodes.includes("returning_paid_eligible")) return "returning_paid_eligible";
  return reasonCodes[0] ?? null;
}

function readStaleSubscriptionCachePremium(): boolean {
  const cached = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (!cached || cached.orgId !== oid) return false;
  const statusActive = String(cached.status || "").toLowerCase() === "active";
  const tierOk = Boolean(cached.tier && tierAllowsAdvancedFullDraftReveal(cached.tier));
  return statusActive && tierOk;
}

/**
 * Synchronous paid/pro probes for Dashboard → Create before async billing fetch settles.
 * Uses subscription cache, workspace entitlement cache, persisted usage tier, and session checkout markers.
 */
export function resolveProvisionalWorkspaceProEntitledForCreate(): boolean {
  if (hasPaidDashboardCreateContextActive()) return true;
  if (shouldFailClosedBypassForAuthenticatedWorkspaceCreate()) return true;
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  if (readCachedWorkspaceProEntitlement()) return true;
  if (readPersistedWorkspaceUsageTierPaid()) return true;
  if (resolveWorkspaceProSubscriptionEntitled()) return true;
  if (readStaleSubscriptionCachePremium()) return true;
  const sub = readCachedSubscriptionEntitlement();
  const oid = getOrgId().trim();
  if (sub?.orgId === oid) {
    const statusActive = String(sub.status || "").toLowerCase() === "active";
    const tierOk = Boolean(sub.tier && tierAllowsAdvancedFullDraftReveal(sub.tier));
    if (statusActive && tierOk) return true;
  }
  if (hasPaidPremiumCompletionSession()) return true;
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) return true;
  if (peekAdvancedFullDraftCheckoutGrant()) return true;
  return false;
}

/** Paid workspace / subscription user creating another agreement on /app/create. */
/**
 * Paid workspace / dashboard create: user already has Pro access — never latch free-starter upgrade UX.
 */
export function resolvePaidCreateFlowFullDraftAccess(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return true;
  if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) return true;
  if (input.paidProAuthoritative) return true;
  if (resolveReturningPaidCreateEligible(input)) return true;
  return shouldUsePaidProCreateFlowReviewShell({
    workspaceProEntitled: input.workspaceProEntitled ?? resolveProvisionalWorkspaceProEntitledForCreate(),
    tier: input.tier,
    premiumPersistedFlowActive: input.premiumPersistedFlowActive,
    premiumSendPathUnlocked: input.premiumSendPathUnlocked,
    paidProAuthoritative: input.paidProAuthoritative,
    premiumCheckoutCompleted: input.premiumCheckoutCompleted,
  });
}

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

export function resolvePaidCreateGateBypassDecision(
  input: ResolveReturningPaidCreateEligibleInput & { partyCount?: number | null } = {},
): PaidCreateGateBypassDecision {
  const reasonCodes: PaidCreateGateBypassReasonCode[] = [];
  const workspaceProCached = readCachedWorkspaceProEntitlement();
  const workspaceProEntitledState = Boolean(input.workspaceProEntitled);
  const dashboardCreateContext = hasPaidDashboardCreateContextActive();
  const provisionalPaid = resolveProvisionalWorkspaceProEntitledForCreate();

  if (dashboardCreateContext) reasonCodes.push("paid_dashboard_create_context");
  if (shouldFailClosedBypassForAuthenticatedWorkspaceCreate()) {
    reasonCodes.push("authenticated_workspace_session_fallback");
  }

  if (workspaceProEntitledState) reasonCodes.push("workspace_pro_entitled_state");
  if (workspaceProCached) reasonCodes.push("workspace_pro_cached");
  if (readPersistedWorkspaceUsageTierPaid()) reasonCodes.push("workspace_usage_tier_persisted_paid");
  if (readStaleSubscriptionCachePremium()) reasonCodes.push("subscription_cache_active_premium");
  const subTierForAccess = subscriptionTierForAccess();
  if (subTierForAccess && tierAllowsAdvancedFullDraftReveal(subTierForAccess)) {
    reasonCodes.push("subscription_tier_for_access");
  }
  if (resolveCreateFlowWorkspaceProEntitled()) reasonCodes.push("create_flow_workspace_pro");
  if (hasPaidPremiumCompletionSession()) reasonCodes.push("premium_completion_session");
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) reasonCodes.push("premium_completion_snapshot");
  if (peekAdvancedFullDraftCheckoutGrant()) reasonCodes.push("checkout_grant");
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) reasonCodes.push("tier_premium");
  if (input.paidProAuthoritative) reasonCodes.push("paid_pro_authoritative");
  if (input.premiumPersistedFlowActive) reasonCodes.push("premium_persisted_flow");
  if (input.premiumSendPathUnlocked) reasonCodes.push("premium_send_path_unlocked");
  if (hasCurrentSessionProEntitlement()) reasonCodes.push("session_pro_entitlement");
  if (hasCurrentSessionProIntent()) reasonCodes.push("session_pro_intent");
  if (
    shouldUsePaidProCreateFlowReviewShell({
      workspaceProEntitled: input.workspaceProEntitled ?? provisionalPaid,
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
      paidProAuthoritative: input.paidProAuthoritative,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    })
  ) {
    reasonCodes.push("paid_pro_review_shell");
  }
  if (
    isCreateFlowPaidAcceptedOrAuthoritativeActive({
      workspaceProEntitled: input.workspaceProEntitled ?? provisionalPaid,
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
      paidProAuthoritative: input.paidProAuthoritative,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    })
  ) {
    reasonCodes.push("create_flow_paid_authoritative");
  }
  if (resolveReturningPaidCreateEligible(input)) reasonCodes.push("returning_paid_eligible");

  const uniqueReasonCodes = [...new Set(reasonCodes)];
  const bypass = uniqueReasonCodes.length > 0;

  return {
    isAppCreate: isAppCreatePath(),
    partyCount: input.partyCount ?? null,
    workspaceProEntitled: workspaceProEntitledState,
    workspaceProCached,
    provisionalPaid,
    bypass,
    reason: bypass ? resolvePrimaryBypassReason(uniqueReasonCodes) : null,
    reasonCodes: uniqueReasonCodes,
  };
}

export function logReturningPaidCreateGateBypassDecision(decision: PaidCreateGateBypassDecision): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[returning-paid-create-gate-bypass-decision]", decision);
}

export function logStarterComplexityGateSkippedForPaidCreate(
  assessment: StarterComplexityGateAssessment,
  decision: PaidCreateGateBypassDecision,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[starter-complexity-gate]", {
    blocked: false,
    skipped_for_paid_create: true,
    partyCount: assessment.partyCount,
    reasonCodes: decision.reasonCodes,
    provisionalPaid: decision.provisionalPaid,
    isAppCreate: decision.isAppCreate,
  });
}

export function logFatalPaidCreateGateAfterProvisionalEntitlement(
  decision: PaidCreateGateBypassDecision,
): void {
  const msg =
    "[fatal-paid-create-gate-after-provisional-entitlement] multi_party_pro_gate applied despite paid/provisional markers";
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    throw new Error(msg);
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.error(msg, decision);
  }
}

/**
 * Paid / returning Dashboard → Create must never hit the public free multi-party Pro gate.
 * Anonymous/free users still see the gate when assessStarterComplexityGate requires it.
 */
export function shouldBypassStarterMultiPartyProGateForPaidCreate(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  return resolvePaidCreateGateBypassDecision(input).bypass;
}

/**
 * On /app/create submit, resolve workspace billing before the starter gate when sync probes are inconclusive.
 * Returns true when paid entitlement is confirmed or provisionally available after fetch.
 */
export async function ensurePaidCreateEntitlementResolvedForSubmit(
  input: ResolveReturningPaidCreateEligibleInput = {},
): Promise<boolean> {
  if (shouldBypassStarterMultiPartyProGateForPaidCreate(input)) return true;
  if (!isAppCreatePath()) return false;
  const oid = getOrgId().trim();
  if (!oid) return false;
  const entitled = await fetchWorkspaceProEntitlement();
  if (entitled) return true;
  return shouldBypassStarterMultiPartyProGateForPaidCreate(input);
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
