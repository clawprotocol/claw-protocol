import { isRealCheckoutAgreementId } from "../auth/preAuthCheckoutAgreement";
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

/** Drop restore=starterReview so Stripe success is not unpaid checkout-Back. */
export function dropStarterReviewRestoreParam(returnTo: string): string {
  const base = "http://localhost";
  try {
    const u = new URL(returnTo, base);
    if (u.searchParams.get("restore") === "starterReview") {
      u.searchParams.delete("restore");
    }
    const out = `${u.pathname}${u.search}${u.hash}`;
    return out || returnTo;
  } catch {
    return returnTo;
  }
}

/**
 * Conversion create returnTo.
 * When a canonical persist/resume agreement ID already exists, do not inject
 * restore=starterReview (pre-pay decoy for after-pay remint / Retry Pro draft).
 * Unpaid checkout-Back without a persist still uses the starterReview snapshot.
 */
export function buildConversionCheckoutReturnTo(persistAgreementId?: string | null): string {
  if (isRealCheckoutAgreementId(persistAgreementId)) return "/app/create";
  return appendReturnToQueryParam("/app/create", "restore", "starterReview");
}

/** Strip starterReview restore from a create returnTo when persist/resume exists. */
export function sanitizeConversionCheckoutReturnTo(args: {
  returnTo: string;
  persistAgreementId?: string | null;
}): string {
  const dest = (args.returnTo || "").trim();
  if (!dest) return dest;
  if (!isRealCheckoutAgreementId(args.persistAgreementId)) return dest;
  if (!dest.startsWith("/app/create")) return dest;
  return dropStarterReviewRestoreParam(dest);
}

function realAgreementIdFromCheckoutDest(dest: string): string | null {
  const noQuery = dest.split("?")[0] || "";
  const prefix = "/app/checkout/";
  if (!noQuery.startsWith(prefix)) return null;
  let id = noQuery.slice(prefix.length).split("/")[0] || "";
  try {
    id = decodeURIComponent(id).trim();
  } catch {
    id = id.trim();
  }
  return isRealCheckoutAgreementId(id) ? id : null;
}

/**
 * Checkout / OAuth dest: drop returnTo restore=starterReview when the conversion
 * persist ID is already in the path or supplied (session resume / pre-auth).
 */
export function sanitizeConversionCheckoutDest(args: {
  dest: string;
  persistAgreementId?: string | null;
}): string {
  const dest = (args.dest || "").trim();
  const persist =
    (isRealCheckoutAgreementId(args.persistAgreementId) ? args.persistAgreementId!.trim() : null) ||
    realAgreementIdFromCheckoutDest(dest);
  if (!isRealCheckoutAgreementId(persist)) return dest;
  try {
    const u = new URL(dest, "http://localhost");
    const rt = u.searchParams.get("returnTo");
    if (!rt) return dest;
    const cleaned = sanitizeConversionCheckoutReturnTo({
      returnTo: rt,
      persistAgreementId: persist,
    });
    if (cleaned === rt) return dest;
    if (cleaned) u.searchParams.set("returnTo", cleaned);
    else u.searchParams.delete("returnTo");
    const out = `${u.pathname}${u.search}${u.hash}`;
    return out || dest;
  } catch {
    return dest;
  }
}

/**
 * Last-good after-pay return: /app/create?premiumCompletion=1
 * Persist identity stays in session (resume / pre-auth). Send-path returnTo is unchanged.
 */
export function buildAfterPayStripeReturnTo(args: { agreementId: string; returnTo: string }): string {
  let dest = (args.returnTo || "").trim() || "/app/create";
  if (!dest.startsWith("/app/create")) return dest;
  dest = dropStarterReviewRestoreParam(dest);
  return appendReturnToQueryParam(dest, "premiumCompletion", "1");
}
