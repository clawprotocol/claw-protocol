import { apiUrl, errorMessageFromResponse } from "../../lib/clawApi";
import { parseAffiliateLandingPath, sanitizeAffiliateUsernameSlug } from "./affiliateLandingRoutes";

const AFFILIATE_CODE_KEY = "claw_affiliate_code";
const AFFILIATE_ATTRIBUTED_ORG_PREFIX = "claw_affiliate_attributed_org:";

function readStoredAffiliateCode(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(AFFILIATE_CODE_KEY);
    const code = sanitizeAffiliateUsernameSlug(String(v || ""));
    return code || null;
  } catch {
    return null;
  }
}

function writeStoredAffiliateCode(code: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(AFFILIATE_CODE_KEY, code);
  } catch {
    /* ignore */
  }
}

export function getAffiliateCodeForAttribution(): string | null {
  return readStoredAffiliateCode();
}

export function rememberAffiliateCode(codeRaw: string | null | undefined): string | null {
  const code = sanitizeAffiliateUsernameSlug(String(codeRaw || ""));
  if (!code) return null;
  writeStoredAffiliateCode(code);
  return code;
}

export function rememberAffiliateCodeFromPathname(pathname: string): string | null {
  const parsed = parseAffiliateLandingPath(pathname);
  if (!parsed) return null;
  return rememberAffiliateCode(parsed.usernameSlug);
}

export function rememberAffiliateCodeFromSearch(search: string): string | null {
  try {
    const q = new URLSearchParams(search || "");
    const aff = sanitizeAffiliateUsernameSlug(q.get("aff") || "");
    if (aff) return rememberAffiliateCode(aff);
    const ref = sanitizeAffiliateUsernameSlug(q.get("ref") || "");
    if (ref) return rememberAffiliateCode(ref);
  } catch {
    /* ignore */
  }
  return null;
}

function attributionDoneKey(orgId: string): string {
  return `${AFFILIATE_ATTRIBUTED_ORG_PREFIX}${orgId}`;
}

function isAttributionDoneForOrg(orgId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(attributionDoneKey(orgId)) === "1";
  } catch {
    return false;
  }
}

function markAttributionDoneForOrg(orgId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(attributionDoneKey(orgId), "1");
  } catch {
    /* ignore */
  }
}

export type EnsureAffiliateAttributionResult =
  | { ok: true; skipped: true; reason: "no_org" | "no_affiliate_code" | "already_marked" }
  | { ok: true; attributed: true; affiliateCode: string }
  | { ok: false; error: string };

/**
 * Best-effort org attribution via /v1/affiliates/attribute.
 * Treated as success when the org is already attributed.
 */
export async function ensureAffiliateAttributionForOrg(orgIdRaw: string): Promise<EnsureAffiliateAttributionResult> {
  const orgId = String(orgIdRaw || "").trim();
  if (!orgId) return { ok: true, skipped: true, reason: "no_org" };
  const affiliateCode = getAffiliateCodeForAttribution();
  if (!affiliateCode) return { ok: true, skipped: true, reason: "no_affiliate_code" };
  if (isAttributionDoneForOrg(orgId)) return { ok: true, skipped: true, reason: "already_marked" };

  try {
    const res = await fetch(apiUrl("/v1/affiliates/attribute"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        affiliate_code: affiliateCode,
        attribution_type: "signup",
      }),
    });
    if (res.ok) {
      markAttributionDoneForOrg(orgId);
      return { ok: true, attributed: true, affiliateCode };
    }
    const msg = (await errorMessageFromResponse(res, "Could not apply referral attribution.")).toLowerCase();
    if (msg.includes("already_attributed")) {
      markAttributionDoneForOrg(orgId);
      return { ok: true, attributed: true, affiliateCode };
    }
    return { ok: false, error: msg || "Could not apply referral attribution." };
  } catch {
    return { ok: false, error: "Could not reach attribution service." };
  }
}
