/**
 * Paid Pro /api/agreements/parse timeouts — separate from premium-full-draft HTTP ceiling.
 * Checkout runs parse (sometimes twice) before premium-full-draft; a 90s abort caused false
 * failure/retry while generation was still viable on the next attempt.
 */

/** Matches premiumFullDraftApi PREMIUM_FULL_DRAFT_FETCH_TIMEOUT_MS (avoid import cycle). */
export const PREMIUM_FULL_DRAFT_CLIENT_CEILING_MS = 150_000;

export const PREMIUM_BASIC_PARSE_TIMEOUT_MS = 5_000;

/** Non-checkout premium parse (interactive paths). */
export const PREMIUM_AGREEMENT_PARSE_DEFAULT_MS = 90_000;

/**
 * Checkout completion: allow slow premium parse + local merge before full-draft HTTP
 * without aborting at the legacy 90s boundary.
 */
export const PREMIUM_AGREEMENT_PARSE_CHECKOUT_MS =
  PREMIUM_FULL_DRAFT_CLIENT_CEILING_MS + 60_000;

export function resolvePremiumAgreementParseTimeoutMs(opts?: {
  aiModelClass?: "basic" | "premium";
  checkoutCompletion?: boolean;
  timeoutMs?: number;
}): number {
  if (opts?.timeoutMs != null && opts.timeoutMs > 0) return opts.timeoutMs;
  if (opts?.aiModelClass !== "premium") return PREMIUM_BASIC_PARSE_TIMEOUT_MS;
  if (opts?.checkoutCompletion) return PREMIUM_AGREEMENT_PARSE_CHECKOUT_MS;
  return PREMIUM_AGREEMENT_PARSE_DEFAULT_MS;
}
