import { getOrgId } from "../launch/orgContext";
import { getAffiliateCodeForAttribution } from "../launch/affiliate/affiliateAttributionContext";
import { resolvePrimaryEntitlementRepairOrg } from "../launch/paidCheckoutOrgContext";
import { anonymousSessionHeaders } from "../auth/anonymousSessionHeaders";
import { getCachedAccessToken } from "../auth/authAccessTokenCache";

/** @alias use {@link clawAgreementHeaders} — same stable workspace identity for all agreement APIs. */
export function getClawApiHeaders(extra?: HeadersInit): HeadersInit {
  return clawAgreementHeaders(extra);
}

/** Sent on agreement API calls so backend usage economics can attribute drafts to a workspace. */
export function clawAgreementHeaders(extra?: HeadersInit): HeadersInit {
  const orgId = getOrgId();
  const base: Record<string, string> = {
    "X-Claw-Org-Id": orgId,
    ...anonymousSessionHeaders(),
  };
  if (orgId.startsWith("user-")) {
    const token = getCachedAccessToken();
    if (token) {
      base.Authorization = `Bearer ${token}`;
    }
  }
  const affiliateCode = getAffiliateCodeForAttribution();
  if (affiliateCode) {
    base["X-Claw-Affiliate-Code"] = affiliateCode;
  }
  const repairOrg = resolvePrimaryEntitlementRepairOrg();
  if (repairOrg) {
    base["X-Claw-Entitlement-Repair-Org"] = repairOrg;
  }
  if (!extra) return base;
  if (extra instanceof Headers) {
    const out: Record<string, string> = { ...base };
    extra.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(extra)) {
    return { ...base, ...Object.fromEntries(extra) };
  }
  return { ...base, ...extra };
}
