/**
 * Post-accept commercial handoff — after authorized signers exist, the buyer must keep
 * one working Continue / Prepare signatures control. Accept 200 + frozen-signing-authority
 * 200 are sufficient; bind-user-org / access recovery is not the Continue predicate.
 */

import { DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA } from "./signerSetupPartyIdentity";
import type { PaidProStickyCtaPhase } from "./paidProStickyCta";

export const POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON =
  "dashboard_signer_setup_resume_complete";

export type PostAcceptReviewHandoffCta = {
  label: string;
  action: "guided_continue";
  disabled: false;
  reason: typeof POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON;
};

/**
 * First failing predicate after accept remount: review_decision hides the sticky bar
 * expecting on-card chrome, but dashboard-resume / shell remount can drop that chrome.
 * Restore last-good Continue to signature links until Prepare is explicitly requested.
 */
export function resolvePostAcceptReviewHandoffCta(args: {
  signerDetailsComplete: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested: boolean;
  reviewDecisionChromeVisible: boolean;
  stickyPhase?: PaidProStickyCtaPhase | null;
}): PostAcceptReviewHandoffCta | null {
  if (args.signaturePreparationRequested) return null;
  if (!args.signerDetailsComplete && !args.signerMetadataFinalized) return null;
  if (args.reviewDecisionChromeVisible) return null;
  if (args.stickyPhase && args.stickyPhase !== "review_decision") return null;
  return {
    label: DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
    action: "guided_continue",
    disabled: false,
    reason: POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON,
  };
}

/** Accept + frozen authority already succeeded — do not re-gate Continue on access probes. */
export function shouldSkipReFinalizeBeforePostAcceptPrepare(args: {
  hasAuthoritativeSigningSnapshot: boolean;
  signerMetadataFinalizedLatch: boolean;
}): boolean {
  return args.hasAuthoritativeSigningSnapshot || args.signerMetadataFinalizedLatch;
}
