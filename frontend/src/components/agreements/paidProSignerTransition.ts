/**
 * Paid Pro signer-setup routing: skip legacy guided_final_review when authority is accepted.
 */

import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON } from "./paidProSignerFinalizeRouting";

export type PaidProSignerTransitionPayload = {
  previousState: string;
  nextState: string;
  navigationTarget: string;
  reason: string;
};

export function logPaidProSignerTransition(payload: PaidProSignerTransitionPayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-transition]", payload);
}

export function shouldRoutePaidProSignerSetupToReviewDecision(args: {
  acceptedPaidProAuthorityActive: boolean;
  hasPaidProSourceOfTruth?: boolean;
  signersComplete: boolean;
  signaturePreparationRequested: boolean;
}): boolean {
  const hasSoT = args.hasPaidProSourceOfTruth ?? hasPaidProSourceOfTruth();
  return (
    (args.acceptedPaidProAuthorityActive || hasSoT) &&
    args.signersComplete &&
    !args.signaturePreparationRequested
  );
}

/** Map guided "continue to final review" to paid Pro review-decision finalize when eligible. */
export function resolvePaidProSignerSetupPrimaryCtaOverride(args: {
  guidedStickyReason: string;
  acceptedPaidProAuthorityActive: boolean;
  paidProFirstReviewSurfaceActive: boolean;
  paidProInlineSignerSetupLatched: boolean;
  signaturePreparationRequested: boolean;
  signersComplete: boolean;
  ctaLabel: string;
}): { reason: string; label: string } | null {
  if (args.guidedStickyReason !== "signer_setup_ready_final_review") return null;
  if (!args.paidProInlineSignerSetupLatched) return null;
  if (
    !shouldRoutePaidProSignerSetupToReviewDecision({
      acceptedPaidProAuthorityActive: args.acceptedPaidProAuthorityActive,
      signersComplete: args.signersComplete,
      signaturePreparationRequested: args.signaturePreparationRequested,
    })
  ) {
    return null;
  }
  if (!args.acceptedPaidProAuthorityActive && !args.paidProFirstReviewSurfaceActive) return null;
  return {
    reason: PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON,
    label: args.ctaLabel,
  };
}
