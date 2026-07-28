/**
 * Authenticated workspace access — entitlement/account states for Create gating.
 *
 * Actors (product):
 * - Anonymous prospective customer (Starter conversion experience)
 * - Authenticated free user within the one complimentary completed-agreement allowance
 * - Authenticated paid owner (active entitlement)
 * - Recipient signer (token holder)
 *
 * Authentication establishes identity/ownership; entitlement establishes create capabilities.
 * When a server commercial entitlement decision is present, it is the sole Create-UI authority
 * (cached paid probes / access.tier must not override it).
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

export type CommercialCreateEntitlementProbe = {
  entitlement: "paid_pro" | "genesis_allowance" | "free" | string;
  createAllowed: boolean;
  /** Auth/authorization failure on the entitlement probe. */
  authFailure?: boolean;
  /** Non-auth transport/API failure — fail closed; not a free plan. */
  probeFailure?: boolean;
  reason?: string | null;
};

export type WorkspaceCreateAccessVerdict = {
  allowed: boolean;
  reason:
    | "anonymous_starter"
    | "entitled_owner"
    | "resume_owned_agreement"
    | "checkout_pending"
    | "entitlement_required"
    | "free_allowance"
    | "free_allowance_exhausted"
    | "genesis_allowance"
    | "genesis_allowance_exhausted"
    | "auth_probe_failed"
    | "entitlement_probe_failed"
    | "recipient_isolated";
  showUpgradeModal: boolean;
  showResubscribeCta: boolean;
  /** Genesis monthly complimentary allowance exhausted — specific UI, not “not Genesis”. */
  showGenesisAllowanceExhausted: boolean;
  /** Entitlement probe failed — retry/support UI, not free-plan upgrade copy. */
  showEntitlementProbeError: boolean;
};

function baseVerdict(
  partial: Omit<WorkspaceCreateAccessVerdict, "showGenesisAllowanceExhausted" | "showEntitlementProbeError"> &
    Partial<Pick<WorkspaceCreateAccessVerdict, "showGenesisAllowanceExhausted" | "showEntitlementProbeError">>,
): WorkspaceCreateAccessVerdict {
  return {
    showGenesisAllowanceExhausted: false,
    showEntitlementProbeError: false,
    ...partial,
  };
}

/**
 * Create access for authenticated workspaces.
 * Free users may create while the server reports ``createAllowed`` (one complimentary
 * completed agreement). After that allowance is consumed, Create shows an upgrade gate.
 * Authenticated users may always resume owned work.
 */
export function resolveWorkspaceCreateAccess(args: {
  authentication: AuthenticationState;
  entitlement: EntitlementState;
  isStarterAnonymousSession: boolean;
  isResumingOwnedAgreement: boolean;
  hasCheckoutPendingMarker: boolean;
  workspaceProEntitledProbe?: boolean;
  /** Server commercial entitlement — sole Create authority when present. */
  commercialEntitlement?: CommercialCreateEntitlementProbe | null;
}): WorkspaceCreateAccessVerdict {
  if (args.isResumingOwnedAgreement) {
    return baseVerdict({
      allowed: true,
      reason: "resume_owned_agreement",
      showUpgradeModal: false,
      showResubscribeCta: false,
    });
  }

  if (args.isStarterAnonymousSession || args.authentication === "unauthenticated") {
    return baseVerdict({
      allowed: true,
      reason: "anonymous_starter",
      showUpgradeModal: false,
      showResubscribeCta: false,
    });
  }

  if (args.authentication === "auth_pending") {
    return baseVerdict({
      allowed: true,
      reason: "anonymous_starter",
      showUpgradeModal: false,
      showResubscribeCta: false,
    });
  }

  if (args.hasCheckoutPendingMarker || args.entitlement === "checkout_pending") {
    return baseVerdict({
      allowed: true,
      reason: "checkout_pending",
      showUpgradeModal: false,
      showResubscribeCta: false,
    });
  }

  const commercial = args.commercialEntitlement;
  if (commercial) {
    if (
      commercial.authFailure ||
      commercial.probeFailure ||
      commercial.reason === "auth_failure" ||
      commercial.reason === "probe_failed"
    ) {
      return baseVerdict({
        allowed: false,
        reason: commercial.authFailure || commercial.reason === "auth_failure"
          ? "auth_probe_failed"
          : "entitlement_probe_failed",
        showUpgradeModal: false,
        showResubscribeCta: false,
        showEntitlementProbeError: true,
      });
    }

    if (commercial.entitlement === "paid_pro" && commercial.createAllowed) {
      return baseVerdict({
        allowed: true,
        reason: "entitled_owner",
        showUpgradeModal: false,
        showResubscribeCta: false,
      });
    }

    if (commercial.entitlement === "genesis_allowance") {
      if (commercial.createAllowed) {
        return baseVerdict({
          allowed: true,
          reason: "genesis_allowance",
          showUpgradeModal: false,
          showResubscribeCta: false,
        });
      }
      return baseVerdict({
        allowed: false,
        reason: "genesis_allowance_exhausted",
        showUpgradeModal: false,
        showResubscribeCta: false,
        showGenesisAllowanceExhausted: true,
      });
    }

    if (commercial.entitlement === "free") {
      if (commercial.createAllowed) {
        return baseVerdict({
          allowed: true,
          reason: "free_allowance",
          showUpgradeModal: false,
          showResubscribeCta: false,
        });
      }
      return baseVerdict({
        allowed: false,
        reason: "free_allowance_exhausted",
        showUpgradeModal: true,
        showResubscribeCta: false,
      });
    }

    // Unknown commercial class — fail closed (no cached paid unlock).
    return baseVerdict({
      allowed: false,
      reason: "entitlement_probe_failed",
      showUpgradeModal: false,
      showResubscribeCta: false,
      showEntitlementProbeError: true,
    });
  }

  // commercialEntitlement absent (still loading): legacy probes only until server decision arrives.
  const entitled =
    args.workspaceProEntitledProbe === true ||
    args.entitlement === "active" ||
    args.entitlement === "canceled_active_period";

  if (entitled) {
    return baseVerdict({
      allowed: true,
      reason: "entitled_owner",
      showUpgradeModal: false,
      showResubscribeCta: false,
    });
  }

  if (args.entitlement === "past_due" || args.entitlement === "expired") {
    return baseVerdict({
      allowed: false,
      reason: "entitlement_required",
      showUpgradeModal: false,
      showResubscribeCta: true,
    });
  }

  return baseVerdict({
    allowed: false,
    reason: "entitlement_required",
    showUpgradeModal: true,
    showResubscribeCta: false,
  });
}

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
