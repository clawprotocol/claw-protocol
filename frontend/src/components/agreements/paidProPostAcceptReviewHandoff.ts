/**
 * Post-accept commercial handoff — after authorized signers exist, the buyer must keep
 * one working Continue / Prepare signatures control. Accept 200 + frozen-signing-authority
 * 200 are sufficient; bind-user-org / access recovery is not the Continue predicate.
 */

import { DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA } from "./signerSetupPartyIdentity";
import type { PaidProStickyCtaPhase } from "./paidProStickyCta";
import {
  assertGuidedVs01SigningHandoffReady,
  selectGuidedSignatureTrackCorpus,
  type GuidedSignatureTrackCorpusSelection,
} from "./guidedDealCompletion/guidedFinalReviewToSigning";
import type { CanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./guidedDealCompletion/signatureRegion";

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

/**
 * Remount Continue was green because skip-re-finalize is correct. The click
 * still died when the paint snapshot lacked By/execution lines: Prepare flipped
 * signaturePreparationRequested (hid Choose your next step + sticky Continue)
 * and resolveFinalVs01CorpusOrBlock returned authoritative_signing_snapshot_not_ready
 * without last-good witness rebuild. The empty emerald sticky is that leftover bar.
 */
export function shouldHandoffPostAcceptPrepareToSignatureLinks(args: {
  hasAuthoritativeSigningSnapshot: boolean;
  snapshotSigningReady: boolean;
  prepareGateAllowed: boolean;
}): boolean {
  if (!args.hasAuthoritativeSigningSnapshot) return false;
  return args.snapshotSigningReady || args.prepareGateAllowed;
}

/**
 * First failing predicate after #137 allow: ensureGuidedSigningCorpusReady returns the
 * rebuilt body, then enterGuidedSignatureTrackRoute re-selects the remount paint snapshot
 * (no By / Signature lines) and assertGuidedVs01SigningHandoffReady fails closed.
 */
export const POST_ACCEPT_PREPARE_TRACK_PAINT_RESELECT_REASON = "missing_signature_block" as const;

export function isSigningReadyPrepareTrackCorpus(
  corpus: string,
  signerCount: number,
): boolean {
  const body = (corpus || "").trim();
  if (!body) return false;
  const count = Math.max(1, signerCount);
  return (
    corpusHasVisibleSignatureExecutionLines(body) &&
    corpusSignatureBlocksHaveRequiredByLines(body, count)
  );
}

/**
 * Prefer the #137-allowed rebuilt corpus over in-session paint refs. Remount paint
 * is long enough for selectGuidedSignatureTrackCorpus but is not signing-ready.
 */
export function resolvePostAcceptPrepareTrackCorpus(args: {
  rebuiltSigningCorpus?: string | null;
  rebuiltSignerCount?: number;
  finalizedSignerApplied?: string | null;
  finalizedSigning?: string | null;
  acceptedReview?: string | null;
}): GuidedSignatureTrackCorpusSelection {
  const rebuilt = (args.rebuiltSigningCorpus || "").trim();
  const signerCount = Math.max(2, args.rebuiltSignerCount ?? 2);
  if (rebuilt && isSigningReadyPrepareTrackCorpus(rebuilt, signerCount)) {
    return {
      source: "finalized_signer_applied_guided_corpus",
      body: rebuilt,
      hash: fingerprintAgreementBody(rebuilt),
    };
  }
  return selectGuidedSignatureTrackCorpus({
    finalizedSignerApplied: args.finalizedSignerApplied,
    finalizedSigning: args.finalizedSigning,
    acceptedReview: args.acceptedReview,
  });
}

export type PostAcceptPrepareTrackPredicate =
  | typeof POST_ACCEPT_PREPARE_TRACK_PAINT_RESELECT_REASON
  | "missing_by_signature_lines"
  | "corpus_source_not_allowed"
  | "manifest_party_rows_missing"
  | "manifest_party_count"
  | "corpus_too_short"
  | string;

/**
 * Live remount click: #137 gate already allowed. Selecting the paint snapshot
 * (what in-session refs still hold) is the first closed gate.
 */
export function firstFailingPostAcceptPrepareTrackPredicate(args: {
  paintCorpus: string;
  rebuiltCorpus: string;
  signerCount: number;
  partyManifest: CanonicalFinalPartyManifest;
  intakeText?: string | null;
}): PostAcceptPrepareTrackPredicate | null {
  const paintSelected = selectGuidedSignatureTrackCorpus({
    acceptedReview: args.paintCorpus,
  });
  const paintAssert = assertGuidedVs01SigningHandoffReady({
    manifest: args.partyManifest,
    corpusSource: paintSelected.source,
    corpusBody: paintSelected.body,
    intakeText: args.intakeText,
  });
  if (!paintAssert.ok) {
    return paintAssert.reason ?? POST_ACCEPT_PREPARE_TRACK_PAINT_RESELECT_REASON;
  }
  const readySelected = resolvePostAcceptPrepareTrackCorpus({
    rebuiltSigningCorpus: args.rebuiltCorpus,
    rebuiltSignerCount: args.signerCount,
    acceptedReview: args.paintCorpus,
  });
  const readyAssert = assertGuidedVs01SigningHandoffReady({
    manifest: args.partyManifest,
    corpusSource: readySelected.source,
    corpusBody: readySelected.body,
    intakeText: args.intakeText,
  });
  return readyAssert.ok ? null : readyAssert.reason ?? "handoff_assert_failed";
}

/**
 * signaturePreparationRequested hid Choose your next step. Until the private
 * signing-links surface is reached, do not leave prepare_signing as label:"" disabled.
 */
export function resolvePostAcceptPrepareRequestedCta(args: {
  signaturePreparationRequested: boolean;
  sendSurfaceReady: boolean;
  signingLinksSurfaceReached?: boolean;
  stickyPhase?: PaidProStickyCtaPhase | null;
}): PostAcceptReviewHandoffCta | null {
  if (!args.signaturePreparationRequested) return null;
  if (args.sendSurfaceReady || args.signingLinksSurfaceReached) return null;
  if (args.stickyPhase && args.stickyPhase !== "prepare_signing") return null;
  return {
    label: DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA,
    action: "guided_continue",
    disabled: false,
    reason: POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON,
  };
}
