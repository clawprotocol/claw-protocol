/**
 * Reopen inline signer setup from post-finalize review (before packet / links are sent).
 */

import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import {
  PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL,
  PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL,
  resolvePaidProReviewSignerDetailsActionLabel,
} from "./authoritativePaidProReview";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";

export { PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL as PAID_PRO_POST_FINALIZE_EDIT_SIGNER_DETAILS_LABEL };
export { PAID_PRO_REVIEW_ADD_SIGNER_DETAILS_LABEL as PAID_PRO_POST_FINALIZE_ADD_SIGNER_DETAILS_LABEL };
export { resolvePaidProReviewSignerDetailsActionLabel as resolvePaidProPostFinalizeSignerDetailsActionLabel };

/** Drop stale post-finalize pins so the next finalize layers metadata on immutable SoT. */
export function beginPaidProPostFinalizeSignerDetailsReopen(): void {
  clearAuthoritativeSigningSnapshot();
  clearPaidProPinnedSignerAppliedCorpus();
}

export function shouldShowPaidProPostFinalizeEditSignerDetails(args: {
  /** Same gate as the forced-route review decision chrome. */
  trackChooserVisible: boolean;
  packetPrepared: boolean;
  signaturePreparationRequested: boolean;
}): boolean {
  return Boolean(
    args.trackChooserVisible &&
      !args.packetPrepared &&
      !args.signaturePreparationRequested,
  );
}

export function logPaidProPostFinalizeEditSignerDetailsOpened(payload: {
  corpusHash: string;
  partyCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-post-finalize-edit-signer-details-opened]", payload);
}
