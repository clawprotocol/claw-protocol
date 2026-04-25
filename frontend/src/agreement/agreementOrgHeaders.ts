import { getOrgId } from "../launch/orgContext";
import { getAffiliateCodeForAttribution } from "../launch/affiliate/affiliateAttributionContext";

/** @alias use {@link clawAgreementHeaders} — same stable workspace identity for all agreement APIs. */
export function getClawApiHeaders(extra?: HeadersInit): HeadersInit {
  return clawAgreementHeaders(extra);
}

/** Sent on agreement API calls so backend usage economics can attribute drafts to a workspace. */
export function clawAgreementHeaders(extra?: HeadersInit): HeadersInit {
  const base: Record<string, string> = {
    "X-Claw-Org-Id": getOrgId(),
  };
  const affiliateCode = getAffiliateCodeForAttribution();
  if (affiliateCode) {
    base["X-Claw-Affiliate-Code"] = affiliateCode;
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
