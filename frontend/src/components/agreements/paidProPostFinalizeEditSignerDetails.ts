/**
 * Reopen inline signer setup from post-finalize review (before packet / links are sent).
 */

import { PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL } from "./authoritativePaidProReview";

export { PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL as PAID_PRO_POST_FINALIZE_EDIT_SIGNER_DETAILS_LABEL };

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
