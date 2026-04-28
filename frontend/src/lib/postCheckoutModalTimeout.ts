/** Post-checkout Pro modal: 30s is extended-wait copy only; hard failopen uses this ceiling. */
export const PREMIUM_POST_CHECKOUT_SOFT_PROGRESS_MS = 30_000;
export const PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS = 120_000;

/**
 * Pure policy helper for tests: whether we should fail open after the hard ceiling when no authoritative body arrived.
 */
export function shouldFailOpenAfterHardCeiling(args: {
  elapsedMs: number;
  hasAcceptedServerFullDraftBody: boolean;
  premiumFullDraftRequestFailed: boolean;
}): boolean {
  if (args.hasAcceptedServerFullDraftBody) return false;
  if (args.premiumFullDraftRequestFailed) return true;
  return args.elapsedMs >= PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS;
}
