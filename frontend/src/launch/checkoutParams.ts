import type { PricingCadence } from "./pricingCadenceStorage";
import type { LaunchPricingTier } from "./pricingTiersData";
import { LAUNCH_PRICING_TIERS } from "./pricingTiersData";

export function extractAgreementIdFromSendReturnUrl(returnTo: string): string | null {
  const path = (returnTo || "").trim().split("?")[0] || "";
  const m = /^\/app\/send\/([^/]+)/.exec(path);
  return m ? decodeURIComponent(m[1]) : null;
}

export function parseTierIdParam(raw: string | null): LaunchPricingTier["id"] | null {
  const id = (raw || "").trim().toLowerCase();
  // Paid-beta: self-serve checkout is Pro only. Legacy "starter"/Plus deep links → Pro.
  if (id === "starter" || id === "plus") return "pro";
  if (id === "pro" || id === "enterprise") return id;
  return null;
}

export function parseCadenceParam(raw: string | null): PricingCadence | null {
  if (raw === "monthly" || raw === "annual") return raw;
  return null;
}

/** Self-serve checkout is Pro only; Enterprise falls back to highlighted Pro. */
export function resolveCheckoutTier(tierParam: LaunchPricingTier["id"] | null): LaunchPricingTier {
  const pro =
    LAUNCH_PRICING_TIERS.find((t) => t.id === "pro") ??
    LAUNCH_PRICING_TIERS.find((t) => t.highlighted) ??
    LAUNCH_PRICING_TIERS[0]!;
  if (tierParam === "enterprise") return pro;
  if (tierParam === "pro") return pro;
  // Legacy starter/Plus ids already normalized to "pro" by parseTierIdParam.
  return pro;
}

/** Ensure return target matches this checkout’s agreement (send intent only). */
export function safeReturnToForAgreement(agreementId: string, candidate: string | null): string {
  const fallback = `/app/send/${encodeURIComponent(agreementId)}?phase=send`;
  if (!candidate || !candidate.startsWith("/app/")) return fallback;
  const parsed = extractAgreementIdFromSendReturnUrl(candidate);
  if (parsed && parsed !== agreementId) return fallback;
  return candidate;
}

/** Append or replace a query param on an in-app return path (e.g. `/app/create?foo=1`). */
export function appendReturnToQueryParam(returnTo: string, key: string, value: string): string {
  const base = "http://localhost";
  try {
    const u = new URL(returnTo, base);
    u.searchParams.set(key, value);
    const out = `${u.pathname}${u.search}${u.hash}`;
    return out || returnTo;
  } catch {
    const enc = encodeURIComponent(value);
    if (!returnTo.includes("?")) return `${returnTo}?${key}=${enc}`;
    return `${returnTo}&${key}=${enc}`;
  }
}
