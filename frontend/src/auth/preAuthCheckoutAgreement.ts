/**
 * Pre-auth checkout agreement id — the conversion draft from this tab.
 * After Google / bind, never replace this real UUID with a different UUID.
 */

import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";

export const PRE_AUTH_CHECKOUT_AGREEMENT_STORAGE_KEY = "claw_pre_auth_checkout_agreement_id_v1";
const STORAGE_KEY = PRE_AUTH_CHECKOUT_AGREEMENT_STORAGE_KEY;

/** First persist on this conversion wins. Do not POST /draft again for a second UUID. */
export function resolveExistingConversionAgreementId(args: {
  reviewAgreementId?: string | null;
  resumeId?: string | null;
  preAuthId?: string | null;
}): string | null {
  for (const raw of [args.preAuthId, args.resumeId, args.reviewAgreementId]) {
    const aid = (raw || "").trim();
    if (isRealCheckoutAgreementId(aid)) return aid;
  }
  return null;
}

export function shouldMintNewDraftForConversion(existingId: string | null | undefined): boolean {
  return !isRealCheckoutAgreementId(existingId);
}

export function isRealCheckoutAgreementId(id: string | null | undefined): boolean {
  const aid = (id || "").trim();
  return Boolean(aid) && aid !== CREATE_FLOW_CHECKOUT_AGREEMENT_ID;
}

export function readPreAuthCheckoutAgreementId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const aid = sessionStorage.getItem(STORAGE_KEY)?.trim() || "";
    return isRealCheckoutAgreementId(aid) ? aid : null;
  } catch {
    return null;
  }
}

/** First real checkout persist/sign-in id wins. Later remints must not overwrite it. */
export function rememberPreAuthCheckoutAgreementId(id: string | null | undefined): string | null {
  const aid = (id || "").trim();
  if (!isRealCheckoutAgreementId(aid)) return readPreAuthCheckoutAgreementId();
  const existing = readPreAuthCheckoutAgreementId();
  if (existing) return existing;
  if (typeof sessionStorage === "undefined") return aid;
  try {
    sessionStorage.setItem(STORAGE_KEY, aid);
  } catch {
    /* ignore quota */
  }
  return aid;
}

export function applyClaimedAgreementIdsToPreAuth(ids: string[] | undefined): string | null {
  const migrated = (ids ?? []).map((id) => id.trim()).filter(isRealCheckoutAgreementId);
  const existing = readPreAuthCheckoutAgreementId();
  if (existing && (migrated.length === 0 || migrated.includes(existing))) return existing;
  if (migrated.length === 0) return existing;
  return rememberPreAuthCheckoutAgreementId(existing || migrated[0]);
}

export function clearPreAuthCheckoutAgreementId(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function pinCheckoutPathToPreAuthAgreement(
  path: string,
  preAuthId?: string | null,
): string {
  const dest = (path || "").trim();
  const aid = (preAuthId || readPreAuthCheckoutAgreementId() || "").trim();
  if (!isRealCheckoutAgreementId(aid)) return dest;
  const prefix = "/app/checkout/";
  const noQuery = dest.split("?")[0] || "";
  if (!noQuery.startsWith(prefix)) return dest;
  const qIndex = dest.indexOf("?");
  const query = qIndex >= 0 ? dest.slice(qIndex) : "";
  let current = noQuery.slice(prefix.length).split("/")[0] || "";
  try {
    current = decodeURIComponent(current).trim();
  } catch {
    current = current.trim();
  }
  if (!current || current === CREATE_FLOW_CHECKOUT_AGREEMENT_ID || current === aid) {
    if (current === aid) return dest;
    return `${prefix}${encodeURIComponent(aid)}${query}`;
  }
  // Dest drifted to a different real UUID (stale/foreign remint). Restore pre-auth.
  return `${prefix}${encodeURIComponent(aid)}${query}`;
}
