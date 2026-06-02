/**
 * When paid Pro SoT is already accepted, premium-review network failures are non-authoritative.
 */

import {
  isPremiumFullDraftNetworkFailure,
  premiumFullDraftNetworkErrorCode,
} from "./premiumFullDraftApi";

export function isPaidProPremiumReviewNetworkFailure(err: unknown): boolean {
  return isPremiumFullDraftNetworkFailure(err);
}

export function logPaidProPremiumReviewNetworkNonfatal(err: unknown, surface: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const code = premiumFullDraftNetworkErrorCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-premium-review-network-nonfatal]", {
    surface,
    error_code: code,
    message: msg.slice(0, 200),
  });
}

/** Advisory premium-review must not trigger corpus repair when SoT is already established. */
export function shouldTreatPremiumReviewFailureAsNonfatal(args: {
  paidProSourceOfTruthEstablished: boolean;
  err: unknown;
}): boolean {
  return args.paidProSourceOfTruthEstablished && isPaidProPremiumReviewNetworkFailure(args.err);
}
