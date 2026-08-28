/**
 * Shared paid Pro review-decision model — one phase SSOT for forced and simple shells.
 *
 * Decision 1: choose delivery track before signer setup.
 * Signer setup: collect metadata (not a decision phase).
 * Decision 2: confirm frozen signing snapshot before packet generation.
 */

export type PaidProReviewDecisionPhase =
  | "decision_1"
  | "signer_setup"
  | "decision_2"
  | "none";

export function resolvePaidProReviewDecisionPhase(args: {
  firstReviewDeliveryTrackDecisionActive: boolean;
  paidProCanonicalReviewSignerSetupActive: boolean;
  paidProSignerMetadataFinalized: boolean;
  postFinalizeReviewDecisionActive: boolean;
}): PaidProReviewDecisionPhase {
  if (
    args.paidProCanonicalReviewSignerSetupActive &&
    !args.paidProSignerMetadataFinalized
  ) {
    return "signer_setup";
  }
  if (args.firstReviewDeliveryTrackDecisionActive) {
    return "decision_1";
  }
  if (args.postFinalizeReviewDecisionActive) {
    return "decision_2";
  }
  return "none";
}

export function resolvePostFinalizeReviewDecisionActive(args: {
  forcedFirstReviewActive: boolean;
  inlineSignerSetupMounted: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested: boolean;
  deliveryTrackDecisionActive: boolean;
  /** Simple or forced paid review shell — Decision 2 is not forced-route-only. */
  paidFirstReviewSurfaceActive?: boolean;
}): boolean {
  if (args.deliveryTrackDecisionActive || args.inlineSignerSetupMounted) return false;
  if (args.signaturePreparationRequested) return false;
  if (!args.signerMetadataFinalized) return false;
  return Boolean(args.paidFirstReviewSurfaceActive ?? args.forcedFirstReviewActive);
}

export function shouldShowPaidProReviewDecisionChrome(phase: PaidProReviewDecisionPhase): boolean {
  return phase === "decision_1" || phase === "decision_2";
}

/**
 * Hide on-card Choose-your-next-step chrome only while the dashboard resume signer form
 * is still the primary surface. After accept remounts review (signers finalized, form
 * unmounted), this must be false — otherwise the chooser is suppressed and the sticky
 * Continue is already hidden (`review_decision`).
 */
export function shouldHidePaidProReviewDecisionChromeForDashboardResume(args: {
  dashboardSignerSetupResumeUiActive: boolean;
  inlineSignerSetupMounted: boolean;
  signerMetadataFinalized: boolean;
}): boolean {
  if (args.signerMetadataFinalized) return false;
  if (!args.dashboardSignerSetupResumeUiActive) return false;
  return args.inlineSignerSetupMounted;
}

export function resolvePaidProPrepareSignaturesHandler(args: {
  phase: PaidProReviewDecisionPhase;
  onDecision1: () => void;
  onDecision2: () => void;
  onFallback: () => void;
}): () => void {
  if (args.phase === "decision_1") return args.onDecision1;
  if (args.phase === "decision_2") return args.onDecision2;
  return args.onFallback;
}
