/** Post-checkout Pro modal: 30s is extended-wait copy only; hard failopen uses this ceiling. */
export const PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS = 30_000;
export const PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS = 120_000;

/**
 * Pure policy helper for tests: whether we should fail open after the hard patience threshold (120s).
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
