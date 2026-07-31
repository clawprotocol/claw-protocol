/**
 * Genesis / paid-Pro first-review → inline signer-setup transition.
 *
 * Clicking "Add signer details" must open the editable signer form in place without
 * regenerating the agreement, clearing SoT, navigating to Create, or consuming allowance.
 */

export const PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID = "claw-paid-pro-inline-signer-setup";

export type PaidProFirstReviewSignerSetupOpenIntent = {
  /** Keep create UI on DRAFT review — never INPUT / Create. */
  createUiStage: "DRAFT";
  displayPhase: "review";
  createFlowPhase: "signer_setup_required";
  /** Mount inline signer fields on the same review surface. */
  inlineSignerSetupLatched: true;
  recipientEditorOpen: true;
  /** Stay on the review document surface (not premium recipients UX / create). */
  premiumRecipientUxActive: false;
  /** Must stay false so Prepare-for-signing is not latched early. */
  signaturePreparationRequested: false;
  /** Never re-enter guided apply / generation from this click. */
  preserveGuidedCompletionPhase: true;
  /** Never clear SoT / signing snapshot from first-review open. */
  preserveAcceptedDocument: true;
};

/** Canonical state intent for opening signer setup from first-review "Add signer details". */
export function resolvePaidProFirstReviewSignerSetupOpenIntent(): PaidProFirstReviewSignerSetupOpenIntent {
  return {
    createUiStage: "DRAFT",
    displayPhase: "review",
    createFlowPhase: "signer_setup_required",
    inlineSignerSetupLatched: true,
    recipientEditorOpen: true,
    premiumRecipientUxActive: false,
    signaturePreparationRequested: false,
    preserveGuidedCompletionPhase: true,
    preserveAcceptedDocument: true,
  };
}

/** True when the first-review primary action should open signer setup (not Prepare / regenerate). */
export function shouldOpenPaidProFirstReviewSignerSetupOnAddDetails(args: {
  firstReviewSurfaceActive: boolean;
  signersReady: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested: boolean;
}): boolean {
  if (!args.firstReviewSurfaceActive) return false;
  if (args.signaturePreparationRequested) return false;
  if (args.signerMetadataFinalized) return false;
  return !args.signersReady;
}

/** After both parties are complete + finalized, primary CTA is Prepare for signing. */
export function resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress(args: {
  signersReady: boolean;
  signerMetadataFinalized: boolean;
}): "add_signer_details" | "prepare_for_signing" {
  if (args.signersReady && args.signerMetadataFinalized) return "prepare_for_signing";
  return "add_signer_details";
}
