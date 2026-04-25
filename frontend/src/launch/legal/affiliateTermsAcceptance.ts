const STORAGE_KEY = "lawdog_affiliate_terms_accepted_v1";

/**
 * Bump when Affiliate Terms materially change (re-prompt in-product).
 * Server-side: persist `affiliate_terms_version_accepted` (or equivalent) on the user/org record.
 */
export const AFFILIATE_TERMS_VERSION_LAUNCH = 3;

/**
 * @todo Backend: POST /v1/me/legal-acceptances { affiliate_terms_version, terms_of_service_version, privacy_version }
 * with authenticated user; merge with this client flag on login.
 */
export function readAffiliateTermsAccepted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    const parsed = raw ? (JSON.parse(raw) as { v?: number }) : null;
    return parsed?.v === AFFILIATE_TERMS_VERSION_LAUNCH;
  } catch {
    return false;
  }
}

export function acceptAffiliateTerms(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: AFFILIATE_TERMS_VERSION_LAUNCH, at: new Date().toISOString() }),
    );
  } catch {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }
}
