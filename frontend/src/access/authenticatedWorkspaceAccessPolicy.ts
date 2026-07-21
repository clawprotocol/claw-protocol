/**
 * Authenticated workspace access — entitlement/account states, not a permanent free product tier.
 *
 * Actors (product):
 * - Anonymous prospective customer (Starter conversion experience)
 * - Authenticated paid owner (active entitlement)
 * - Recipient signer (token holder)
 *
 * Authentication establishes identity/ownership; entitlement establishes paid capabilities.
 */

import type { AccessTier } from "./types";
import type { UsageTotals } from "./types";

export type AuthenticationState =
  | "unauthenticated"
  | "auth_pending"
  | "authenticated";

export type EntitlementState =
  | "none"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "canceled_active_period"
  | "expired";

export type WorkspaceCreateAccessVerdict = {
  allowed: boolean;
  reason:
    | "anonymous_starter"
    | "entitled_owner"
    | "resume_owned_agreement"
    | "checkout_pending"
    | "entitlement_required"
    | "recipient_isolated";
  showUpgradeModal: boolean;
  showResubscribeCta: boolean;
};

export function resolveAuthenticationState(args: {
  isAuthenticated: boolean;
  authLoading?: boolean;
}): AuthenticationState {
  if (args.authLoading) return "auth_pending";
  return args.isAuthenticated ? "authenticated" : "unauthenticated";
}

export function resolveEntitlementStateFromTier(tier: AccessTier): EntitlementState {
  if (tier === "free") return "none";
  if (tier === "standard") return "active";
  return "active";
}

/**
 * Replaces obsolete `shouldBlockSecondAgreementCreation` ("authenticated free user, one agreement").
 * Authenticated users without entitlement may resume owned work but cannot open paid-owner create
 * without checkout / resubscribe — they are NOT granted a permanent free dashboard tier.
 */
export function resolveWorkspaceCreateAccess(args: {
  authentication: AuthenticationState;
  entitlement: EntitlementState;
  isStarterAnonymousSession: boolean;
  isResumingOwnedAgreement: boolean;
  hasCheckoutPendingMarker: boolean;
  workspaceProEntitledProbe?: boolean;
}): WorkspaceCreateAccessVerdict {
  if (args.isResumingOwnedAgreement) {
    return {
      allowed: true,
      reason: "resume_owned_agreement",
      showUpgradeModal: false,
      showResubscribeCta: false,
    };
  }

  if (args.isStarterAnonymousSession || args.authentication === "unauthenticated") {
    return {
      allowed: true,
      reason: "anonymous_starter",
      showUpgradeModal: false,
      showResubscribeCta: false,
    };
  }

  if (args.authentication === "auth_pending") {
    return {
      allowed: true,
      reason: "anonymous_starter",
      showUpgradeModal: false,
      showResubscribeCta: false,
    };
  }

  if (args.hasCheckoutPendingMarker || args.entitlement === "checkout_pending") {
    return {
      allowed: true,
      reason: "checkout_pending",
      showUpgradeModal: false,
      showResubscribeCta: false,
    };
  }

  const entitled =
    args.workspaceProEntitledProbe === true ||
    args.entitlement === "active" ||
    args.entitlement === "canceled_active_period";

  if (entitled) {
    return {
      allowed: true,
      reason: "entitled_owner",
      showUpgradeModal: false,
      showResubscribeCta: false,
    };
  }

  if (args.entitlement === "past_due" || args.entitlement === "expired") {
    return {
      allowed: false,
      reason: "entitlement_required",
      showUpgradeModal: false,
      showResubscribeCta: true,
    };
  }

  return {
    allowed: false,
    reason: "entitlement_required",
    showUpgradeModal: true,
    showResubscribeCta: false,
  };
}

/** @deprecated Use resolveWorkspaceCreateAccess — retained for test migration only. */
export function shouldBlockAuthenticatedCreateWithoutEntitlement(args: {
  isAuthenticated: boolean;
  tier: AccessTier;
  workspaceProEntitled: boolean;
  isStarterAnonymousSession: boolean;
}): boolean {
  const verdict = resolveWorkspaceCreateAccess({
    authentication: args.isAuthenticated ? "authenticated" : "unauthenticated",
    entitlement: resolveEntitlementStateFromTier(args.tier),
    isStarterAnonymousSession: args.isStarterAnonymousSession,
    isResumingOwnedAgreement: false,
    hasCheckoutPendingMarker: false,
    workspaceProEntitledProbe: args.workspaceProEntitled,
  });
  return !verdict.allowed && verdict.reason === "entitlement_required";
}

export function readLawDogUserMonetizationStateForPolicy(
  tier: AccessTier,
  usage: UsageTotals,
  isAuthenticated: boolean,
): { tier: AccessTier; isAuthenticated: boolean; agreements_created: number } {
  return {
    tier,
    isAuthenticated,
    agreements_created: usage.agreements_created,
  };
}
