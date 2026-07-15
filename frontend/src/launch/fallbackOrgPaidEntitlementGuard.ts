/**
 * Hard guards: development/fallback org identities must never grant paid Pro entitlement
 * on production or staging-like public deployments.
 *
 * local-org / empty: never paid (shared bootstrap identity).
 * anon-*: never path-inferred paid (dashboard marker / fail-closed); checkout session
 * grants and verified API entitlement after payment may still proceed.
 */

import { isAnonymousWorkspaceOrg, isLegacySharedLocalOrg } from "../auth/anonymousOwnerContext";
import { getOrgId } from "./orgContext";
import { isPublicProductionHostname } from "./devPaymentBypass";

export type FallbackOrgEntitlementGuardDecision = {
  blocked: boolean;
  reason: string | null;
  orgId: string;
  orgClass: "local" | "anon" | "user" | "other" | "empty";
  productionLikeHost: boolean;
};

function readHostname(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URL(window.location.origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function classifyFallbackOrgId(orgId?: string | null): FallbackOrgEntitlementGuardDecision["orgClass"] {
  const oid = (orgId ?? "").trim();
  if (!oid) return "empty";
  if (isLegacySharedLocalOrg(oid)) return "local";
  if (isAnonymousWorkspaceOrg(oid)) return "anon";
  if (oid.startsWith("user-")) return "user";
  return "other";
}

/** Production host, Vite PROD build, or MODE=production — never trust local-org/mock bootstrap. */
export function isProductionLikeEntitlementEnvironment(env?: {
  PROD?: boolean;
  MODE?: string;
  hostname?: string;
}): boolean {
  const hostname = (env?.hostname ?? readHostname()).toLowerCase();
  if (hostname && isPublicProductionHostname(hostname)) return true;
  if (env?.PROD === true) return true;
  const mode = String(
    env?.MODE ?? (typeof import.meta !== "undefined" ? import.meta.env?.MODE : "") ?? "",
  )
    .trim()
    .toLowerCase();
  if (mode === "production") return true;
  if (hostname.endsWith(".railway.app") || hostname.endsWith(".up.railway.app")) return true;
  return false;
}

/** local-org / empty bootstrap — never a paid owner identity. */
export function mustBlockPaidEntitlementForLegacyFallbackOrg(orgId?: string | null): boolean {
  const orgClass = classifyFallbackOrgId(orgId ?? getOrgId());
  return orgClass === "local" || orgClass === "empty";
}

/**
 * Path/route/dashboard inference must not grant paid for anonymous or legacy orgs.
 * Does not block verified checkout session grants or user-* entitlement.
 */
export function mustBlockPathInferredPaidEntitlement(orgId?: string | null): boolean {
  const orgClass = classifyFallbackOrgId(orgId ?? getOrgId());
  return orgClass === "local" || orgClass === "empty" || orgClass === "anon";
}

export function evaluateFallbackOrgPaidEntitlementBlock(
  orgId?: string | null,
  env?: { PROD?: boolean; MODE?: string; hostname?: string },
): FallbackOrgEntitlementGuardDecision {
  const oid = (orgId ?? getOrgId()).trim();
  const orgClass = classifyFallbackOrgId(oid);
  const productionLikeHost = isProductionLikeEntitlementEnvironment(env);
  const base = { orgId: oid, orgClass, productionLikeHost };

  if (orgClass === "local" || orgClass === "empty") {
    return { ...base, blocked: true, reason: `fallback_org_never_paid:${orgClass}` };
  }
  if (productionLikeHost && orgClass === "anon") {
    return { ...base, blocked: true, reason: "production_anonymous_org_path_inferred" };
  }
  if (productionLikeHost && orgClass !== "user") {
    return { ...base, blocked: true, reason: "production_non_user_org" };
  }
  return { ...base, blocked: false, reason: null };
}

/** Case F / production guard: legacy fallback org must never resolve entitled. */
export function mustBlockPaidEntitlementForFallbackOrg(orgId?: string | null): boolean {
  return mustBlockPaidEntitlementForLegacyFallbackOrg(orgId);
}
