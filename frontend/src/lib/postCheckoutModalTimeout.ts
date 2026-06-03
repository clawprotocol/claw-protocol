/** Post-checkout Pro modal: 30s is extended-wait copy only; terminal failopen uses hard ceiling. */
export const PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS = 30_000;

/**
 * While authoritative premium-full-draft is still in flight, switch to extended-wait copy
 * (not terminal). Successful traced runs can exceed 120s; keep concern UI at 150s+.
 */
export const PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS = 150_000;

/**
 * Terminal failopen when the authoritative request is no longer in flight (or failed).
 * Aligned above typical ~121–125s successful server_full_draft completions.
 */
export const PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS = 180_000;

/**
 * Pure policy helper for tests: whether we should fail open after the hard patience threshold.
 * Never terminal while the authoritative premium request is still in flight.
 */
export function shouldFailOpenAfterHardCeiling(args: {
  elapsedMs: number;
  hasAcceptedServerFullDraftBody: boolean;
  premiumFullDraftRequestFailed: boolean;
  authoritativeRequestInFlight?: boolean;
}): boolean {
  if (args.hasAcceptedServerFullDraftBody) return false;
  if (args.authoritativeRequestInFlight) return false;
  if (args.premiumFullDraftRequestFailed) return true;
  return args.elapsedMs >= PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS;
}
