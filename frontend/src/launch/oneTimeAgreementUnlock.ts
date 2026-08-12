/**
 * $9 one-time agreement unlock is out of the paid-beta release.
 *
 * No environment flag, operator switch, checkout intent, or customer CTA
 * may enable this path. Older checkout branches remain in source but are
 * unreachable because these helpers always return false.
 */

export function isOneTimeAgreementUnlockEnabled(): boolean {
  return false;
}

/** Always false in paid-beta — deep-link intent cannot activate $9 checkout. */
export function isSingleAgreementCheckoutIntent(_params: URLSearchParams): boolean {
  return false;
}
