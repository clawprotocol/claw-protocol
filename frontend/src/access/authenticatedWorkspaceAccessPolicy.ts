/**
 * Authenticated workspace access — entitlement/account states for Create gating.
 *
 * Buyer plans: Guest and Pro only. Genesis is an affiliate/partner status, never a create tier.
 * When a server commercial entitlement decision is present, it is the sole Create-UI authority.
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
  entitlement?: "paid_pro" | "genesis_allowance" | "guest" | "none" | "free" | string;
  state?: "guest" | "pending_genesis" | "genesis" | "pro" | "none" | string;
  createAllowed: boolean;
  canCreatePersistedAgreement?: boolean;
  canSaveGuestDraft?: boolean;
  agreementAllowance?: number | null;
  agreementsRemaining?: number | null;
  periodEndsAt?: string | null;
  /** Auth/authorization failure on the entitlement probe. */
  authFailure?: boolean;
  /** Non-auth transport/API failure — fail closed. */
  probeFailure?: boolean;
  reason?: string | null;
};

export type WorkspaceCreateAccessVerdict = {
  allowed: boolean;
  reason:
    | "anonymous_starter"
    | "guest_draft"
    | "entitled_owner"
    | "resume_owned_agreement"
    | "checkout_pending"
    | "entitlement_required"
    | "pending_genesis"
    | "free_allowance"
    | "free_allowance_exhausted"
    | "genesis_allowance"
    | "genesis_allowance_exhausted"
    | "pro_allowance_exhausted"
    | "auth_probe_failed"
    | "entitlement_probe_failed"
    | "recipient_isolated";
  showUpgradeModal: boolean;
  showResubscribeCta: boolean;
  /** @deprecated Genesis buyer allowance retired — always false. */
  showGenesisAllowanceExhausted: boolean;
  /** Entitlement probe failed — retry/support UI. */
  showEntitlementProbeError: boolean;
  /** @deprecated Genesis buyer CTA retired — always false; Choose Pro only. */
  showRequestGenesisCta: boolean;
  /**
   * Authenticated without Pro — stable full-page access choice (Pro checkout).
   * When true, Create must not render the agreement editor.
   */
  showAccessChoiceScreen: boolean;
};

function baseVerdict(
  partial: Omit<
    WorkspaceCreateAccessVerdict,
    | "showGenesisAllowanceExhausted"
    | "showEntitlementProbeError"
    | "showRequestGenesisCta"
    | "showAccessChoiceScreen"
  > &
    Partial<
      Pick<
        WorkspaceCreateAccessVerdict,
        | "showGenesisAllowanceExhausted"
        | "showEntitlementProbeError"
        | "showRequestGenesisCta"
        | "showAccessChoiceScreen"
      >
    >,
): WorkspaceCreateAccessVerdict {
  return {
    showGenesisAllowanceExhausted: false,
    showEntitlementProbeError: false,
    showRequestGenesisCta: false,
    showAccessChoiceScreen: false,
    ...partial,
  };
}

/**
 * Create access for workspaces. Guests may create a temporary draft.
 * Persisted creates require Genesis or Pro from the server decision.
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
    const commercial = args.commercialEntitlement;
    if (commercial && (commercial.state === "guest" || commercial.entitlement === "guest")) {
      const guestOk = commercial.canSaveGuestDraft ?? commercial.createAllowed;
      return baseVerdict({
        allowed: guestOk,
        reason: "guest_draft",
        showUpgradeModal: !guestOk,
        showResubscribeCta: false,
      });
    }
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

    // Map retired Genesis buyer states → unentitled (affiliate status is separate).
    const rawState = commercial.state || (
      commercial.entitlement === "paid_pro"
        ? "pro"
        : commercial.entitlement === "guest"
          ? "guest"
          : "none"
    );
    const state =
      rawState === "genesis" ||
      rawState === "pending_genesis" ||
      commercial.entitlement === "genesis_allowance"
        ? "none"
        : rawState;

    if (state === "pro") {
      const ok = commercial.canCreatePersistedAgreement ?? commercial.createAllowed;
      if (ok) {
        return baseVerdict({
          allowed: true,
          reason: "entitled_owner",
          showUpgradeModal: false,
          showResubscribeCta: false,
        });
      }
      return baseVerdict({
        allowed: false,
        reason: "pro_allowance_exhausted",
        showUpgradeModal: true,
        showResubscribeCta: false,
      });
    }

    if (state === "guest") {
      const guestOk = commercial.canSaveGuestDraft ?? commercial.createAllowed;
      return baseVerdict({
        allowed: guestOk,
        reason: "guest_draft",
        showUpgradeModal: !guestOk,
        showResubscribeCta: false,
      });
    }

    // Authenticated none — Choose Pro only (no Genesis / Free create).
    return baseVerdict({
      allowed: false,
      reason: "entitlement_required",
      showUpgradeModal: false,
      showResubscribeCta: false,
      showRequestGenesisCta: false,
      showAccessChoiceScreen: true,
    });
  }

  // commercialEntitlement absent: fail closed — never grant create from local Pro probes alone.
  if (args.entitlement === "past_due" || args.entitlement === "expired") {
    return baseVerdict({
      allowed: false,
      reason: "entitlement_required",
      showUpgradeModal: false,
      showResubscribeCta: true,
      showAccessChoiceScreen: true,
      showRequestGenesisCta: false,
    });
  }

  return baseVerdict({
    allowed: false,
    reason: "entitlement_required",
    showUpgradeModal: false,
    showResubscribeCta: false,
    showRequestGenesisCta: false,
    showAccessChoiceScreen: true,
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
