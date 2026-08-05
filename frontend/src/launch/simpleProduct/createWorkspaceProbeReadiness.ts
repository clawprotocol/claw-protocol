/**
 * Create-page probe readiness after OAuth / magic-link return.
 * Authenticated sessions must not call subscription/usage/affiliate APIs with anon-* orgs.
 */

export function isUserWorkspaceOrgId(orgId: string | null | undefined): boolean {
  return String(orgId || "").trim().startsWith("user-");
}

export function isStaleAnonymousOrgId(orgId: string | null | undefined): boolean {
  const o = String(orgId || "").trim();
  return !o || o === "local-org" || o.startsWith("anon-");
}

export type CreateWorkspaceProbeReadiness =
  | { ready: true; reason: "anonymous_ok" | "authenticated_user_org" }
  | {
      ready: false;
      reason: "auth_loading" | "awaiting_user_org" | "cold_referral_redirect" | "cold_referral_auth_pending";
    };

/**
 * Gate entitlement / subscription / affiliate probes on create.
 * - Cold referral + signed-out: never probe (redirect / auth pending).
 * - Signed-in + anon/local org: wait for bind hydration (do not probe with anon-*).
 */
export function resolveCreateWorkspaceProbeReadiness(args: {
  authLoading: boolean;
  isAuthenticated: boolean;
  orgId: string;
  coldReferralRedirect: boolean;
  /** True when URL still has ?ref= and visitor is not authenticated yet. */
  hasColdReferralInSearch?: boolean;
}): CreateWorkspaceProbeReadiness {
  if (args.coldReferralRedirect) {
    return { ready: false, reason: "cold_referral_redirect" };
  }
  if (args.authLoading) {
    return { ready: false, reason: "auth_loading" };
  }
  if (!args.isAuthenticated && args.hasColdReferralInSearch) {
    return { ready: false, reason: "cold_referral_auth_pending" };
  }
  if (args.isAuthenticated) {
    if (isUserWorkspaceOrgId(args.orgId)) {
      return { ready: true, reason: "authenticated_user_org" };
    }
    return { ready: false, reason: "awaiting_user_org" };
  }
  return { ready: true, reason: "anonymous_ok" };
}

/** UI must not show workspace-access errors while auth/org is still settling. */
export function shouldSuppressCreateEntitlementProbeError(args: {
  probeReady: boolean;
  showEntitlementProbeError: boolean;
}): boolean {
  if (!args.probeReady) return true;
  return !args.showEntitlementProbeError;
}
