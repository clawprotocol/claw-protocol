import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { isRealCheckoutAgreementId, rememberPreAuthCheckoutAgreementId } from "../auth/preAuthCheckoutAgreement";
import type { PricingCadence } from "./pricingCadenceStorage";
import type { LaunchPricingTier } from "./pricingTiersData";
import { LAUNCH_PRICING_TIERS } from "./pricingTiersData";

export const AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM = "restoreAgreementId";

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

/** Drop restore=starterReview so after-pay does not remint a hollow create. */
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
 * Stripe return_to for a real persist ID: same agreement through existing final review.
 * Sentinel create-flow keeps the caller returnTo (often restore=starterReview).
 */
export function buildAfterPayStripeReturnTo(args: { agreementId: string; returnTo: string }): string {
  const aid = (args.agreementId || "").trim();
  let dest = (args.returnTo || "").trim() || "/app/create";
  if (!dest.startsWith("/app/create")) return dest;
  if (isRealCheckoutAgreementId(aid)) {
    dest = dropStarterReviewRestoreParam(dest);
    dest = appendReturnToQueryParam(dest, AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM, aid);
  }
  if (aid === CREATE_FLOW_CHECKOUT_AGREEMENT_ID || dest.startsWith("/app/create")) {
    dest = appendReturnToQueryParam(dest, "premiumCompletion", "1");
  }
  return dest;
}

export function readAfterPayRestoreAgreementIdFromSearch(search: string): string | null {
  try {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const key of [AFTER_PAY_RESTORE_AGREEMENT_ID_PARAM, "agreementId"]) {
      const aid = (q.get(key) || "").trim();
      if (isRealCheckoutAgreementId(aid)) return aid;
    }
    return null;
  } catch {
    return null;
  }
}

/** Pin the paid persist so after-pay return does not POST a second /api/agreements/draft. */
export function pinAfterPayRestoreAgreementId(agreementId: string | null | undefined): string | null {
  const aid = (agreementId || "").trim();
  if (!isRealCheckoutAgreementId(aid)) return null;
  writeCreateReviewAgreementResumeId(aid);
  rememberPreAuthCheckoutAgreementId(aid);
  return aid;
}
